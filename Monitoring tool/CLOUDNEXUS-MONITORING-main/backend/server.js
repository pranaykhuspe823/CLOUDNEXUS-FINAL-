'use strict';
// CloudNexus Unified Backend — monitoring + billing

// normalizer
// utils/normalizer.js
// Normalizes resources from all clouds into a common schema

const FAMILY_MAP = {
  // AWS
  'ec2': 'Compute', 'rds': 'Database', 's3': 'Storage',
  'lambda': 'Serverless', 'eks': 'Container', 'ecs': 'Container',
  'elasticache': 'Cache', 'elb': 'Networking', 'alb': 'Networking',
  'cloudfront': 'CDN', 'sqs': 'Messaging', 'sns': 'Messaging',
  'vpc': 'Networking', 'subnet': 'Networking',
  // GCP
  'compute': 'Compute', 'sql': 'Database', 'gcs': 'Storage',
  'functions': 'Serverless', 'gke': 'Container', 'run': 'Serverless',
  'bigtable': 'Database', 'firestore': 'Database', 'bigquery': 'Analytics',
  'pubsub': 'Messaging', 'memorystore': 'Cache',
  // Azure
  'vm': 'Compute', 'sqldb': 'Database', 'blob': 'Storage',
  'functionapp': 'Serverless', 'aks': 'Container', 'cosmos': 'Database',
  'eventhub': 'Messaging', 'redis': 'Cache', 'servicebus': 'Messaging',
  'appservice': 'Compute', 'vnet': 'Networking',
};

function mapFamily(serviceType) {
  const lower = serviceType.toLowerCase();
  for (const [key, family] of Object.entries(FAMILY_MAP)) {
    if (lower.includes(key)) return family;
  }
  return 'Other';
}

function healthFromStatus(status, checks = null) {
  if (!status) return 'warning';
  const s = String(status).toLowerCase();
  if (['running', 'available', 'active', 'healthy', 'succeeded', 'ok', 'online', 'started', 'deployed'].some(x => s.includes(x))) return 'healthy';
  if (['stopped', 'terminated', 'failed', 'error', 'critical', 'unhealthy'].some(x => s.includes(x))) return 'critical';
  if (['warning', 'pending', 'starting', 'stopping', 'degraded', 'impaired'].some(x => s.includes(x))) return 'warning';
  return 'warning';
}

function estimateMonthlyCost(resource) {
  // Very rough estimates for UI purposes. Real cost comes from Cost Explorer / billing APIs
  const { type, family, instanceType, vcpu, memory, sizeGB } = resource;
  if (instanceType) {
    const map = {
      't3.micro': 8.50, 't3.small': 17, 't3.medium': 34, 't3.large': 67,
      't3.xlarge': 134, 'm5.large': 87, 'm5.xlarge': 174, 'm5.2xlarge': 348,
      'c5.large': 85, 'c5.xlarge': 170, 'r5.large': 121, 'r5.xlarge': 242,
      // GCP
      'n1-standard-1': 24, 'n1-standard-2': 48, 'n1-standard-4': 96,
      'e2-medium': 26, 'e2-standard-2': 49, 'n2-standard-2': 67,
      // Azure
      'Standard_B1s': 8, 'Standard_B2s': 38, 'Standard_D2s_v3': 70,
      'Standard_D4s_v3': 140, 'Standard_E2s_v3': 87,
    };
    const v = map[instanceType];
    if (v) return v;
  }
  const familyCosts = {
    Compute: 65, Database: 120, Storage: 25, Serverless: 15, Container: 200,
    Cache: 50, CDN: 30, Analytics: 80, Messaging: 20, Networking: 35, Other: 40,
  };
  return familyCosts[family] || 40;
}

// credentialStore
// utils/credentialStore.js
// In-memory encrypted credential store (use a proper secrets manager in production)
const crypto = require('crypto');

const store = new Map();
const ALGORITHM = 'aes-256-gcm';

// Simple session-based key (in prod, use HSM / KMS)
const SESSION_KEY = crypto.randomBytes(32);

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, SESSION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(data) {
  const [ivHex, authTagHex, encryptedHex] = data.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, SESSION_KEY, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

const credentialStore = {
  // key format: "${orgAdmin}::${provider}"
  set(orgAdmin, provider, creds) {
    const encrypted = encrypt(JSON.stringify(creds));
    store.set(`${orgAdmin}::${provider}`, encrypted);
  },
  get(orgAdmin, provider) {
    const enc = store.get(`${orgAdmin}::${provider}`);
    if (!enc) return null;
    try { return JSON.parse(decrypt(enc)); } catch { return null; }
  },
  delete(orgAdmin, provider) {
    store.delete(`${orgAdmin}::${provider}`);
  },
  has(orgAdmin, provider) {
    return store.has(`${orgAdmin}::${provider}`);
  },
  listProviders(orgAdmin) {
    const prefix = `${orgAdmin}::`;
    return Array.from(store.keys())
      .filter(k => k.startsWith(prefix))
      .map(k => k.slice(prefix.length));
  },
  listAllOrgProviders() {
    return Array.from(store.keys()).map(k => {
      const idx = k.indexOf('::');
      return { orgAdmin: k.slice(0, idx), provider: k.slice(idx + 2) };
    });
  },
};

// alertService
// services/alertService.js
// Manages alerts from all providers + auto-generated health alerts

class AlertService {
  constructor() {
    this.alerts = new Map(); // id -> alert
    this.rules = [
      { id: 'cpu-high', metric: 'cpu', threshold: 85, severity: 'warning', message: 'CPU usage above 85%' },
      { id: 'cpu-critical', metric: 'cpu', threshold: 95, severity: 'critical', message: 'CPU usage above 95%' },
      { id: 'mem-high', metric: 'memUsage', threshold: 85, severity: 'warning', message: 'Memory usage above 85%' },
      { id: 'disk-high', metric: 'diskUsage', threshold: 90, severity: 'warning', message: 'Disk usage above 90%' },
      { id: 'health-critical', metric: 'health', value: 'critical', severity: 'critical', message: 'Resource health is critical' },
      { id: 'connections-high', metric: 'connections', threshold: 90, severity: 'warning', message: 'DB connections near limit' },
    ];
  }

  generateFromResources(resources) {
    const generated = [];
    for (const r of resources) {
      for (const rule of this.rules) {
        if (rule.metric === 'health' && r.health === rule.value) {
          const alertId = `health-${r.id}`;
          if (!this.alerts.has(alertId)) {
            const alert = {
              id: alertId,
              title: `${r.name} is ${r.health}`,
              message: `${r.type} in ${r.region} has health status: ${r.health}`,
              severity: rule.severity,
              provider: r.provider,
              service: r.name,
              region: r.region,
              resourceId: r.id,
              time: new Date().toISOString(),
              acknowledged: false,
              autoGenerated: true,
            };
            this.alerts.set(alertId, alert);
            generated.push(alert);
          }
        } else if (rule.metric !== 'health' && r[rule.metric] !== undefined && r[rule.metric] >= rule.threshold) {
          const alertId = `${rule.id}-${r.id}`;
          if (!this.alerts.has(alertId)) {
            const alert = {
              id: alertId,
              title: `${r.name}: ${rule.message}`,
              message: `${r.type} in ${r.region}: ${rule.metric} is ${r[rule.metric]}% (threshold: ${rule.threshold}%)`,
              severity: rule.severity,
              provider: r.provider,
              service: r.name,
              region: r.region,
              resourceId: r.id,
              time: new Date().toISOString(),
              acknowledged: false,
              autoGenerated: true,
            };
            this.alerts.set(alertId, alert);
            generated.push(alert);
          }
        }
      }
    }
    return generated;
  }

  addProviderAlerts(alerts) {
    for (const a of alerts) {
      if (!this.alerts.has(a.id)) {
        this.alerts.set(a.id, a);
      }
    }
  }

  acknowledge(alertId) {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  getAll() {
    return Array.from(this.alerts.values()).sort((a, b) => {
      // Critical first, then by time
      const sev = { critical: 0, warning: 1, info: 2 };
      const sevDiff = (sev[a.severity] || 2) - (sev[b.severity] || 2);
      if (sevDiff !== 0) return sevDiff;
      return new Date(b.time) - new Date(a.time);
    });
  }

  clear() {
    this.alerts.clear();
  }

  getStats() {
    const all = this.getAll();
    return {
      total: all.length,
      critical: all.filter(a => a.severity === 'critical' && !a.acknowledged).length,
      warning: all.filter(a => a.severity === 'warning' && !a.acknowledged).length,
      unacknowledged: all.filter(a => !a.acknowledged).length,
    };
  }
}

// awsService
// services/awsService.js
const { EC2Client, DescribeInstancesCommand, DescribeVpcsCommand, DescribeSubnetsCommand,
  DescribeSecurityGroupsCommand, DescribeInternetGatewaysCommand, DescribeNatGatewaysCommand,
  DescribeNetworkInterfacesCommand, DescribeInstanceTypesCommand, DescribeImagesCommand,
  DescribeVolumesCommand, DescribeRouteTablesCommand } = require('@aws-sdk/client-ec2');
const { RDSClient, DescribeDBInstancesCommand, DescribeDBClustersCommand,
  DescribeDBParameterGroupsCommand, DescribeDBSubnetGroupsCommand } = require('@aws-sdk/client-rds');
const { S3Client, ListBucketsCommand, GetBucketLocationCommand, GetBucketAclCommand,
  GetBucketVersioningCommand, GetBucketEncryptionCommand, GetBucketTaggingCommand,
  GetBucketLifecycleConfigurationCommand, ListObjectsV2Command,
  GetPublicAccessBlockCommand, GetBucketPolicyCommand } = require('@aws-sdk/client-s3');
const { LambdaClient, ListFunctionsCommand, GetFunctionCommand,
  GetFunctionConcurrencyCommand, ListLayersCommand } = require('@aws-sdk/client-lambda');
const { EKSClient, ListClustersCommand, DescribeClusterCommand, ListNodegroupsCommand,
  DescribeNodegroupCommand, ListAddonsCommand, DescribeAddonCommand } = require('@aws-sdk/client-eks');
const { ECSClient, ListClustersCommand: ECSListClustersCommand, DescribeClustersCommand,
  ListServicesCommand, DescribeServicesCommand } = require('@aws-sdk/client-ecs');
const { ElastiCacheClient, DescribeCacheClustersCommand } = require('@aws-sdk/client-elasticache');
const { ElasticLoadBalancingV2Client, DescribeLoadBalancersCommand,
  DescribeTargetGroupsCommand, DescribeTargetHealthCommand, DescribeListenersCommand } = require('@aws-sdk/client-elastic-load-balancing-v2');
const { CloudWatchClient, GetMetricStatisticsCommand, DescribeAlarmsCommand, ListMetricsCommand } = require('@aws-sdk/client-cloudwatch');
const { SQSClient, ListQueuesCommand, GetQueueAttributesCommand } = require('@aws-sdk/client-sqs');
const { SNSClient, ListTopicsCommand, GetTopicAttributesCommand } = require('@aws-sdk/client-sns');
const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
const { IAMClient, ListInstanceProfilesCommand } = require('@aws-sdk/client-iam');
const { SSMClient, GetInventoryCommand, SendCommandCommand, GetCommandInvocationCommand } = require('@aws-sdk/client-ssm');
const { Route53Client, ListHostedZonesCommand, ListResourceRecordSetsCommand } = require('@aws-sdk/client-route-53');
const { LightsailClient, GetInstancesCommand: LightsailGetInstancesCommand, GetDatabasesCommand } = require('@aws-sdk/client-lightsail');

// vCPU & memory lookup for common instance families (fallback when DescribeInstanceTypes unavailable)
const INSTANCE_SPECS = {
  't2.nano': { vcpu: 1, memGiB: 0.5 }, 't2.micro': { vcpu: 1, memGiB: 1 }, 't2.small': { vcpu: 1, memGiB: 2 },
  't2.medium': { vcpu: 2, memGiB: 4 }, 't2.large': { vcpu: 2, memGiB: 8 }, 't2.xlarge': { vcpu: 4, memGiB: 16 },
  't3.nano': { vcpu: 2, memGiB: 0.5 }, 't3.micro': { vcpu: 2, memGiB: 1 }, 't3.small': { vcpu: 2, memGiB: 2 },
  't3.medium': { vcpu: 2, memGiB: 4 }, 't3.large': { vcpu: 2, memGiB: 8 }, 't3.xlarge': { vcpu: 4, memGiB: 16 }, 't3.2xlarge': { vcpu: 8, memGiB: 32 },
  'm5.large': { vcpu: 2, memGiB: 8 }, 'm5.xlarge': { vcpu: 4, memGiB: 16 }, 'm5.2xlarge': { vcpu: 8, memGiB: 32 }, 'm5.4xlarge': { vcpu: 16, memGiB: 64 },
  'm6i.large': { vcpu: 2, memGiB: 8 }, 'm6i.xlarge': { vcpu: 4, memGiB: 16 }, 'm6i.2xlarge': { vcpu: 8, memGiB: 32 },
  'c5.large': { vcpu: 2, memGiB: 4 }, 'c5.xlarge': { vcpu: 4, memGiB: 8 }, 'c5.2xlarge': { vcpu: 8, memGiB: 16 }, 'c5.4xlarge': { vcpu: 16, memGiB: 32 },
  'c6i.large': { vcpu: 2, memGiB: 4 }, 'c6i.xlarge': { vcpu: 4, memGiB: 8 }, 'c6i.2xlarge': { vcpu: 8, memGiB: 16 },
  'r5.large': { vcpu: 2, memGiB: 16 }, 'r5.xlarge': { vcpu: 4, memGiB: 32 }, 'r5.2xlarge': { vcpu: 8, memGiB: 64 },
  'r6i.large': { vcpu: 2, memGiB: 16 }, 'r6i.xlarge': { vcpu: 4, memGiB: 32 }, 'r6i.2xlarge': { vcpu: 8, memGiB: 64 },
  'p3.2xlarge': { vcpu: 8, memGiB: 61 }, 'p3.8xlarge': { vcpu: 32, memGiB: 244 },
  'g4dn.xlarge': { vcpu: 4, memGiB: 16 }, 'g4dn.2xlarge': { vcpu: 8, memGiB: 32 },
};

const AWS_REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'eu-west-1', 'eu-west-2', 'eu-central-1',
  'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1',
  'ap-south-1', 'ca-central-1', 'sa-east-1',
];

class AWSService {
  constructor(credentials) {
    this.creds = credentials;
    this.region = credentials.region || 'us-east-1';
    this._instanceTypeCache = {};
    this._sgCache = {};
    this._igwCache = {};
  }

  getClientConfig(region) {
    const cfg = { region: region || this.region };
    if (this.creds.authType === 'keys') {
      cfg.credentials = {
        accessKeyId: this.creds.accessKeyId,
        secretAccessKey: this.creds.secretAccessKey,
        ...(this.creds.sessionToken ? { sessionToken: this.creds.sessionToken } : {}),
      };
    }
    return cfg;
  }

  async verifyConnection() {
    try {
      const sts = new STSClient(this.getClientConfig());
      const res = await sts.send(new GetCallerIdentityCommand({}));
      return { success: true, account: res.Account, arn: res.Arn, userId: res.UserId };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async getMetric(namespace, metricName, dimensions, region) {
    try {
      const cw = new CloudWatchClient(this.getClientConfig(region));
      const end = new Date();
      const start = new Date(end - 10 * 60 * 1000);
      const res = await cw.send(new GetMetricStatisticsCommand({
        Namespace: namespace,
        MetricName: metricName,
        Dimensions: dimensions,
        StartTime: start,
        EndTime: end,
        Period: 300,
        Statistics: ['Average'],
      }));
      const pts = res.Datapoints || [];
      if (!pts.length) return null;
      pts.sort((a, b) => b.Timestamp - a.Timestamp);
      return Math.round(pts[0].Average * 10) / 10;
    } catch { return null; }
  }

  // Fetch instance type specs (vCPU, memory) from AWS with cache
  async getInstanceTypeSpecs(instanceType, region) {
    if (!instanceType) return { vcpu: null, memGiB: null };
    const cacheKey = `${region}:${instanceType}`;
    if (this._instanceTypeCache[cacheKey]) return this._instanceTypeCache[cacheKey];
    // Use local lookup first
    if (INSTANCE_SPECS[instanceType]) {
      this._instanceTypeCache[cacheKey] = INSTANCE_SPECS[instanceType];
      return INSTANCE_SPECS[instanceType];
    }
    try {
      const ec2 = new EC2Client(this.getClientConfig(region));
      const res = await ec2.send(new DescribeInstanceTypesCommand({ InstanceTypes: [instanceType] }));
      const it = res.InstanceTypes?.[0];
      if (it) {
        const specs = {
          vcpu: it.VCpuInfo?.DefaultVCpus || null,
          memGiB: it.MemoryInfo?.SizeInMiB ? it.MemoryInfo.SizeInMiB / 1024 : null,
          gpus: it.GpuInfo?.Gpus?.[0]?.Count || 0,
          gpuModel: it.GpuInfo?.Gpus?.[0]?.Name || null,
          networkPerformance: it.NetworkInfo?.NetworkPerformance || null,
          storageSupported: it.InstanceStorageSupported || false,
          instanceStorageGB: it.InstanceStorageInfo?.TotalSizeInGB || 0,
          processorArch: it.ProcessorInfo?.SupportedArchitectures?.[0] || null,
          hypervisor: it.Hypervisor || null,
        };
        this._instanceTypeCache[cacheKey] = specs;
        return specs;
      }
    } catch {}
    return { vcpu: null, memGiB: null };
  }

  // Fetch all security groups in a region with full rules, cached
  async getSecurityGroupDetails(sgIds, region) {
    if (!sgIds || !sgIds.length) return [];
    try {
      const ec2 = new EC2Client(this.getClientConfig(region));
      const res = await ec2.send(new DescribeSecurityGroupsCommand({ GroupIds: sgIds }));
      return (res.SecurityGroups || []).map(sg => ({
        id: sg.GroupId,
        name: sg.GroupName,
        description: sg.Description,
        vpcId: sg.VpcId,
        inboundRules: (sg.IpPermissions || []).map(p => ({
          protocol: p.IpProtocol === '-1' ? 'All' : p.IpProtocol,
          fromPort: p.FromPort,
          toPort: p.ToPort,
          sources: [
            ...(p.IpRanges || []).map(r => r.CidrIp),
            ...(p.Ipv6Ranges || []).map(r => r.CidrIpv6),
            ...(p.UserIdGroupPairs || []).map(r => r.GroupId),
          ],
        })),
        outboundRules: (sg.IpPermissionsEgress || []).map(p => ({
          protocol: p.IpProtocol === '-1' ? 'All' : p.IpProtocol,
          fromPort: p.FromPort,
          toPort: p.ToPort,
          destinations: [
            ...(p.IpRanges || []).map(r => r.CidrIp),
            ...(p.Ipv6Ranges || []).map(r => r.CidrIpv6),
          ],
        })),
      }));
    } catch { return []; }
  }

  // Fetch EBS volume sizes for a list of volume IDs
  async getEBSVolumeSizes(volumeIds, region) {
    if (!volumeIds || !volumeIds.length) return [];
    try {
      const ec2 = new EC2Client(this.getClientConfig(region));
      const res = await ec2.send(new DescribeVolumesCommand({ VolumeIds: volumeIds }));
      return (res.Volumes || []).map(v => ({
        id: v.VolumeId,
        sizeGB: v.Size || 0,
        type: v.VolumeType,
        state: v.State,
        iops: v.Iops,
        encrypted: v.Encrypted,
      }));
    } catch { return []; }
  }

  // Fetch disk usage metrics from CloudWatch Agent for an EC2 instance
  // Requires AWS CloudWatch Agent to be installed and publishing CWAgent metrics to CloudWatch.
  // Read EC2 disk usage from CloudWatch CWAgent namespace â€” read-only, no metrics created,
  // free within CloudWatch free tier (1M API requests/month free).
  // Returns all mounted filesystems the same shape as SSM Inventory data.
  async getInstanceDiskMetricsFromCWAgent(instanceId, region) {
    try {
      const cw = new CloudWatchClient(this.getClientConfig(region));
      // List all disk_used metrics for this instance (one entry per filesystem/path)
      const listRes = await cw.send(new ListMetricsCommand({
        Namespace: 'CWAgent',
        MetricName: 'disk_used',
        Dimensions: [{ Name: 'InstanceId', Value: instanceId }],
      }));
      const metrics = listRes.Metrics || [];
      if (!metrics.length) return null;

      const toGB = v => v != null ? Math.round(v / 1073741824 * 100) / 100 : null;

      // Fetch used / free / total for every filesystem in parallel
      const filesystems = await Promise.all(metrics.map(async metric => {
        const dims = metric.Dimensions;
        const path = dims.find(d => d.Name === 'path')?.Value || '/';
        const [used, free, total] = await Promise.all([
          this.getMetric('CWAgent', 'disk_used',  dims, region),
          this.getMetric('CWAgent', 'disk_free',  dims, region),
          this.getMetric('CWAgent', 'disk_total', dims, region),
        ]);
        if (used == null && free == null && total == null) return null;
        const diskTotalGB = toGB(total);
        const diskUsedGB  = toGB(used);
        const diskFreeGB  = toGB(free);
        return {
          name: path,
          diskTotalGB,
          diskUsedGB,
          diskFreeGB,
          utilization: diskTotalGB > 0 && diskUsedGB != null
            ? Math.round((diskUsedGB / diskTotalGB) * 100) : null,
        };
      }));

      const valid = filesystems.filter(f => f && f.diskTotalGB > 0);
      return valid.length > 0 ? valid : null;
    } catch { return null; }
  }

  // On-demand fetch of S3 bucket objects + policy (called when user opens the drawer)
  async getS3BucketDetails(bucketName) {
    const result = { objects: [], objectsTotalSizeBytes: 0, hasMoreObjects: false, policy: null };

    // Step 1: detect the bucket's actual region so we use the right endpoint
    let bucketRegion = this.region || 'us-east-1';
    try {
      const globalS3 = new S3Client(this.getClientConfig());
      const loc = await globalS3.send(new GetBucketLocationCommand({ Bucket: bucketName }));
      bucketRegion = loc.LocationConstraint || 'us-east-1';
    } catch (e) {
      console.error(`[S3] could not get region for ${bucketName}: ${e.message}`);
    }

    // Step 2: use a regional client for all subsequent calls
    const s3 = new S3Client(this.getClientConfig(bucketRegion));

    await Promise.allSettled([
      // Bucket policy
      s3.send(new GetBucketPolicyCommand({ Bucket: bucketName })).then(p => {
        try { result.policy = JSON.parse(p.Policy); }
        catch { result.policy = p.Policy; }
      }).catch(e => {
        if (e.name !== 'NoSuchBucketPolicy') {
          console.error(`[S3] policy error for ${bucketName}: ${e.message}`);
        }
      }),

      // Paginated object listing â€” up to 5000 objects
      (async () => {
        try {
          let token;
          const MAX = 5000;
          do {
            const res = await s3.send(new ListObjectsV2Command({
              Bucket: bucketName, MaxKeys: 1000, ContinuationToken: token,
            }));
            for (const obj of res.Contents || []) {
              result.objects.push({
                key:          obj.Key,
                size:         obj.Size || 0,
                lastModified: obj.LastModified ? new Date(obj.LastModified).toISOString() : null,
                storageClass: obj.StorageClass,
              });
              result.objectsTotalSizeBytes += obj.Size || 0;
            }
            result.hasMoreObjects = !!(res.IsTruncated && result.objects.length >= MAX);
            token = (res.IsTruncated && result.objects.length < MAX) ? res.NextContinuationToken : undefined;
          } while (token);
          console.log(`[S3] listed ${result.objects.length} objects in ${bucketName} (${bucketRegion})`);
        } catch (e) {
          console.error(`[S3] list error for ${bucketName}: ${e.message}`);
          result.listError = e.message;
        }
      })(),
    ]);

    return result;
  }

  // Fetch real S3 bucket size from CloudWatch BucketSizeBytes (accurate, no agent, just access keys)
  // CloudWatch S3 metrics are updated daily â€” no object listing limit
  async getS3BucketSizeFromCloudWatch(bucketName, region) {
    try {
      const cw = new CloudWatchClient(this.getClientConfig(region));
      // Discover which storage-type metrics exist for this bucket
      const listRes = await cw.send(new ListMetricsCommand({
        Namespace: 'AWS/S3',
        MetricName: 'BucketSizeBytes',
        Dimensions: [{ Name: 'BucketName', Value: bucketName }],
      }));
      const metrics = listRes.Metrics || [];
      if (!metrics.length) return null;

      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 days back (S3 metrics are daily)

      let totalBytes = 0;
      await Promise.all(metrics.map(async metric => {
        try {
          const res = await cw.send(new GetMetricStatisticsCommand({
            Namespace: 'AWS/S3',
            MetricName: 'BucketSizeBytes',
            Dimensions: metric.Dimensions,
            StartTime: startTime,
            EndTime: endTime,
            Period: 86400,
            Statistics: ['Average'],
          }));
          const latest = (res.Datapoints || []).sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp))[0];
          if (latest?.Average != null) totalBytes += latest.Average;
        } catch {}
      }));

      return totalBytes > 0 ? Math.round(totalBytes / 1073741824 * 1000) / 1000 : null;
    } catch { return null; }
  }

  // Fetch real S3 object count from CloudWatch NumberOfObjects
  async getS3ObjectCountFromCloudWatch(bucketName, region) {
    try {
      const cw = new CloudWatchClient(this.getClientConfig(region));
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 3 * 24 * 60 * 60 * 1000);
      const res = await cw.send(new GetMetricStatisticsCommand({
        Namespace: 'AWS/S3',
        MetricName: 'NumberOfObjects',
        Dimensions: [
          { Name: 'BucketName', Value: bucketName },
          { Name: 'StorageType', Value: 'AllStorageTypes' },
        ],
        StartTime: startTime,
        EndTime: endTime,
        Period: 86400,
        Statistics: ['Average'],
      }));
      const latest = (res.Datapoints || []).sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp))[0];
      return latest?.Average != null ? Math.round(latest.Average) : null;
    } catch { return null; }
  }

  // Fetch real filesystem usage from SSM Inventory (AWS:FileSystem)
  // Works on any instance with SSM Agent installed (default on AL2, AL2023, Windows Server 2016+)
  async getInstanceFilesystemData(instanceId, region) {
    try {
      const ssm = new SSMClient(this.getClientConfig(region));
      const res = await ssm.send(new GetInventoryCommand({
        Filters: [{ Key: 'AWS:InstanceInformation.InstanceId', Values: [instanceId], Type: 'Equal' }],
        ResultAttributes: [{ TypeName: 'AWS:FileSystem' }],
        MaxResults: 10,
      }));
      const entity = (res.Entities || [])[0];
      const fsData = entity?.Data?.['AWS:FileSystem']?.Content;
      if (!fsData || !fsData.length) return null;

      // Parse "X.XX GB" strings to numbers
      const parseGB = str => {
        if (!str) return null;
        const n = parseFloat(str);
        if (isNaN(n)) return null;
        const s = str.toUpperCase();
        if (s.includes('TB')) return Math.round(n * 1024 * 100) / 100;
        if (s.includes('MB')) return Math.round(n / 1024 * 100) / 100;
        return Math.round(n * 100) / 100; // already GB
      };

      // Prefer root filesystem (/), then C:, then largest
      const sorted = [...fsData].sort((a, b) => {
        const aRoot = a.Name === '/' || a.Name === 'C:' || a.MountPoint === '/';
        const bRoot = b.Name === '/' || b.Name === 'C:' || b.MountPoint === '/';
        if (aRoot && !bRoot) return -1;
        if (bRoot && !aRoot) return 1;
        return (parseGB(b.Size) || 0) - (parseGB(a.Size) || 0);
      });

      // Return all filesystems, not just root
      return sorted.map(fs => ({
        name: fs.Name || fs.MountPoint || '/',
        type: fs.Type,
        diskTotalGB: parseGB(fs.Size),
        diskUsedGB: parseGB(fs.UsedSpace),
        diskFreeGB: parseGB(fs.AvailableSpace),
        utilization: parseFloat(fs.Utilization) || null,
      })).filter(fs => fs.diskTotalGB > 0);
    } catch { return null; }
  }

  // Check if a VPC has an internet gateway attached
  async getInternetGatewayForVpc(vpcId, region) {
    if (!vpcId) return null;
    const cacheKey = `${region}:${vpcId}`;
    if (this._igwCache[cacheKey] !== undefined) return this._igwCache[cacheKey];
    try {
      const ec2 = new EC2Client(this.getClientConfig(region));
      const res = await ec2.send(new DescribeInternetGatewaysCommand({
        Filters: [{ Name: 'attachment.vpc-id', Values: [vpcId] }],
      }));
      const igw = res.InternetGateways?.[0];
      const result = igw ? { id: igw.InternetGatewayId, state: igw.Attachments?.[0]?.State } : null;
      this._igwCache[cacheKey] = result;
      return result;
    } catch { this._igwCache[cacheKey] = null; return null; }
  }

  // Detect OS from platform details or AMI name
  detectOS(platformDetails, platform) {
    if (platform === 'windows') return 'Windows';
    if (!platformDetails) return 'Linux';
    const pd = platformDetails.toLowerCase();
    if (pd.includes('windows')) return 'Windows';
    if (pd.includes('amazon linux')) return 'Amazon Linux';
    if (pd.includes('ubuntu')) return 'Ubuntu';
    if (pd.includes('red hat') || pd.includes('rhel')) return 'RHEL';
    if (pd.includes('suse') || pd.includes('sles')) return 'SUSE Linux';
    if (pd.includes('debian')) return 'Debian';
    if (pd.includes('centos')) return 'CentOS';
    return 'Linux';
  }

  async installCWAgent(instanceId, region) {
    const ssm = new SSMClient(this.getClientConfig(region));
    const res = await ssm.send(new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-ConfigureAWSPackage',
      Parameters: { action: ['Install'], name: ['AmazonCloudWatchAgent'] },
      TimeoutSeconds: 600,
      Comment: 'Install CloudWatch Agent via CloudNexus',
    }));
    const commandId = res.Command?.CommandId;
    if (!commandId) throw new Error('SSM did not return a CommandId');
    return commandId;
  }

  async configureCWAgent(instanceId, region, platform) {
    const ssm = new SSMClient(this.getClientConfig(region));
    const isWindows = (platform || '').toLowerCase().includes('windows');

    const linuxScript = [
      'mkdir -p /opt/aws/amazon-cloudwatch-agent/etc',
      `cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json << 'EOF'`,
      JSON.stringify({ metrics: { namespace: 'CWAgent', metrics_collected: { disk: {
        measurement: ['used', 'free', 'total'],
        metrics_collection_interval: 300,
        resources: ['*'],
        ignore_file_system_types: ['sysfs','devtmpfs','tmpfs','squashfs','overlay','proc','cgroup'],
      } } } }),
      'EOF',
      '/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json',
      'systemctl enable amazon-cloudwatch-agent 2>/dev/null || true',
      'echo "CWAgent configured and started"',
    ].join('\n');

    const windowsScript = [
      '$p = "C:\\ProgramData\\Amazon\\AmazonCloudWatchAgent\\amazon-cloudwatch-agent.json"',
      'New-Item -ItemType Directory -Force -Path (Split-Path $p) | Out-Null',
      `'${JSON.stringify({ metrics: { namespace: 'CWAgent', metrics_collected: { LogicalDisk: {
        measurement: ['% Free Space', 'Free Megabytes'],
        resources: ['*'],
        metrics_collection_interval: 300,
      } } } })}' | Out-File -FilePath $p -Encoding UTF8 -Force`,
      '& "C:\\Program Files\\Amazon\\AmazonCloudWatchAgent\\amazon-cloudwatch-agent-ctl.ps1" -a fetch-config -m ec2 -s -c file:$p',
      'Write-Host "CWAgent configured and started"',
    ].join('\n');

    const res = await ssm.send(new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: isWindows ? 'AWS-RunPowerShellScript' : 'AWS-RunShellScript',
      Parameters: { commands: isWindows ? windowsScript.split('\n') : linuxScript.split('\n') },
      TimeoutSeconds: 300,
      Comment: 'Configure CloudWatch Agent via CloudNexus',
    }));
    const commandId = res.Command?.CommandId;
    if (!commandId) throw new Error('SSM did not return a CommandId for configure step');
    return commandId;
  }

  async getCWAgentCommandStatus(commandId, instanceId, region) {
    const ssm = new SSMClient(this.getClientConfig(region));
    try {
      const res = await ssm.send(new GetCommandInvocationCommand({ CommandId: commandId, InstanceId: instanceId }));
      return {
        status: res.StatusDetails,
        stdout: (res.StandardOutputContent || '').slice(-800),
        stderr: (res.StandardErrorContent || '').slice(-400),
      };
    } catch (e) {
      if (e.name === 'InvocationDoesNotExist') return { status: 'Pending' };
      throw e;
    }
  }

  async getEC2Instances(region) {
    try {
      const ec2 = new EC2Client(this.getClientConfig(region));
      const instances = [];

      // Paginate DescribeInstances to ensure we fetch >100 instances when present
      let nextToken = undefined;
      do {
        const res = await ec2.send(new DescribeInstancesCommand({ MaxResults: 1000, NextToken: nextToken }));
        for (const r of res.Reservations || []) {
          for (const i of r.Instances || []) {
          // Include ALL states: running, stopped, stopping, pending, terminated, shutting-down
          const nameTag = i.Tags?.find(t => t.Key === 'Name')?.Value;
          const tags = Object.fromEntries((i.Tags || []).map(t => [t.Key, t.Value]));

          // Fetch metrics, instance type specs, security group details, IGW, EBS volumes & disk metrics in parallel
          const ebsVolumeIds = (i.BlockDeviceMappings || []).map(b => b.Ebs?.VolumeId).filter(Boolean);
          const [cpu, netIn, netOut, diskRead, diskWrite, specs, sgDetails, igw, ebsVolumes] = await Promise.all([
            this.getMetric('AWS/EC2', 'CPUUtilization', [{ Name: 'InstanceId', Value: i.InstanceId }], region),
            this.getMetric('AWS/EC2', 'NetworkIn', [{ Name: 'InstanceId', Value: i.InstanceId }], region),
            this.getMetric('AWS/EC2', 'NetworkOut', [{ Name: 'InstanceId', Value: i.InstanceId }], region),
            this.getMetric('AWS/EC2', 'DiskReadBytes', [{ Name: 'InstanceId', Value: i.InstanceId }], region),
            this.getMetric('AWS/EC2', 'DiskWriteBytes', [{ Name: 'InstanceId', Value: i.InstanceId }], region),
            this.getInstanceTypeSpecs(i.InstanceType, region),
            this.getSecurityGroupDetails((i.SecurityGroups || []).map(sg => sg.GroupId), region),
            this.getInternetGatewayForVpc(i.VpcId, region),
            this.getEBSVolumeSizes(ebsVolumeIds, region),
          ]);

          // Collect all network interfaces (multiple ENIs possible)
          const networkInterfaces = (i.NetworkInterfaces || []).map(nic => ({
            interfaceId: nic.NetworkInterfaceId,
            subnetId: nic.SubnetId,
            vpcId: nic.VpcId,
            privateIp: nic.PrivateIpAddress,
            privateIps: (nic.PrivateIpAddresses || []).map(pip => pip.PrivateIpAddress),
            publicIp: nic.Association?.PublicIp,
            publicDns: nic.Association?.PublicDnsName,
            macAddress: nic.MacAddress,
            status: nic.Status,
            description: nic.Description,
          }));

          // Root and EBS volumes
          const volumes = (i.BlockDeviceMappings || []).map(bdm => ({
            deviceName: bdm.DeviceName,
            volumeId: bdm.Ebs?.VolumeId,
            deleteOnTermination: bdm.Ebs?.DeleteOnTermination,
            attachTime: bdm.Ebs?.AttachTime,
            status: bdm.Ebs?.Status,
          }));

          instances.push({
            id: `aws-ec2-${i.InstanceId}`,
            rawId: i.InstanceId,
            name: nameTag || i.InstanceId,
            type: 'EC2 Instance',
            family: 'Compute',
            provider: 'aws',
            region,
            az: i.Placement?.AvailabilityZone,
            tenancy: i.Placement?.Tenancy,
            status: i.State?.Name,
            health: i.State?.Name === 'running' ? 'healthy' : healthFromStatus(i.State?.Name),

            // Specs
            instanceType: i.InstanceType,
            vcpu: specs.vcpu || (i.CpuOptions?.CoreCount ? i.CpuOptions.CoreCount * (i.CpuOptions.ThreadsPerCore || 1) : null),
            memGiB: specs.memGiB,
            gpus: specs.gpus || 0,
            gpuModel: specs.gpuModel || null,
            networkPerformance: specs.networkPerformance,
            processorArch: specs.processorArch,
            hypervisor: specs.hypervisor || i.Hypervisor,
            instanceStorageGB: specs.instanceStorageGB || 0,

            // Network
            ip: i.PrivateIpAddress,
            publicIp: i.PublicIpAddress,
            privateDns: i.PrivateDnsName,
            publicDns: i.PublicDnsName,
            vpc: i.VpcId,
            subnet: i.SubnetId,
            networkInterfaces,
            internetGateway: igw,
            isPrivate: !i.PublicIpAddress,
            networkAccess: i.PublicIpAddress ? 'public' : 'private',

            // Security
            securityGroups: sgDetails,
            iamRole: i.IamInstanceProfile?.Arn?.split('/').pop() || null,
            iamProfileArn: i.IamInstanceProfile?.Arn || null,

            // OS & Image
            os: this.detectOS(i.PlatformDetails, i.Platform),
            platform: i.Platform || 'linux',
            platformDetails: i.PlatformDetails,
            imageId: i.ImageId,
            kernelId: i.KernelId,

            // Storage â€” real EBS sizes from DescribeVolumes (access key only, no agent)
            rootDeviceName: i.RootDeviceName,
            rootDeviceType: i.RootDeviceType,
            volumes,
            ebsVolumes,
            storageGB: ebsVolumes.reduce((s, v) => s + (v.sizeGB || 0), 0) || null,
            filesystems: null,
            diskUsedGB: null,
            diskFreeGB: null,
            diskTotalGB: null,
            diskPath: null,

            // Monitoring & lifecycle
            monitoring: i.Monitoring?.State,
            launchTime: i.LaunchTime,
            uptime: i.LaunchTime ? formatUptime(i.LaunchTime) : null,
            lifecycleType: i.InstanceLifecycle || 'on-demand',
            stateTransitionReason: i.StateTransitionReason,
            ebsOptimized: i.EbsOptimized,
            enaSupport: i.EnaSupport,
            sourceDestCheck: i.SourceDestCheck,

            // Metrics
            cpu: cpu ?? null,
            networkInKB: netIn ? Math.round(netIn / 1024) : null,
            networkOutKB: netOut ? Math.round(netOut / 1024) : null,
            diskReadKB: diskRead ? Math.round(diskRead / 1024) : null,
            diskWriteKB: diskWrite ? Math.round(diskWrite / 1024) : null,

            cost: estimateMonthlyCost({ instanceType: i.InstanceType, family: 'Compute' }),
            tags,
            connections: [],
          });
          }
        }
        nextToken = res.NextToken;
      } while (nextToken);

      return instances;
    } catch (e) {
      console.error(`EC2 error [${region}]:`, e.message);
      return [];
    }
  }

  async getRDSInstances(region) {
    try {
      const rds = new RDSClient(this.getClientConfig(region));
      const res = await rds.send(new DescribeDBInstancesCommand({}));
      const instances = [];

      for (const db of res.DBInstances || []) {
        const [cpu, conns, freeStorage, readIOPS, writeIOPS, specs] = await Promise.all([
          this.getMetric('AWS/RDS', 'CPUUtilization', [{ Name: 'DBInstanceIdentifier', Value: db.DBInstanceIdentifier }], region),
          this.getMetric('AWS/RDS', 'DatabaseConnections', [{ Name: 'DBInstanceIdentifier', Value: db.DBInstanceIdentifier }], region),
          this.getMetric('AWS/RDS', 'FreeStorageSpace', [{ Name: 'DBInstanceIdentifier', Value: db.DBInstanceIdentifier }], region),
          this.getMetric('AWS/RDS', 'ReadIOPS', [{ Name: 'DBInstanceIdentifier', Value: db.DBInstanceIdentifier }], region),
          this.getMetric('AWS/RDS', 'WriteIOPS', [{ Name: 'DBInstanceIdentifier', Value: db.DBInstanceIdentifier }], region),
          this.getInstanceTypeSpecs(db.DBInstanceClass?.replace('db.', ''), region).catch(() => ({})),
        ]);

        instances.push({
          id: `aws-rds-${db.DBInstanceIdentifier}`,
          rawId: db.DBInstanceIdentifier,
          name: db.DBInstanceIdentifier,
          type: 'RDS Instance',
          family: 'Database',
          provider: 'aws',
          region,
          az: db.AvailabilityZone,
          secondaryAz: db.SecondaryAvailabilityZone,
          status: db.DBInstanceStatus,
          health: db.DBInstanceStatus === 'available' ? 'healthy' : healthFromStatus(db.DBInstanceStatus),

          // Specs
          instanceType: db.DBInstanceClass,
          vcpu: specs.vcpu || null,
          memGiB: specs.memGiB || null,
          engine: db.Engine,
          engineVersion: db.EngineVersion,
          licenseModel: db.LicenseModel,
          characterSetName: db.CharacterSetName,

          // Storage
          allocatedStorageGB: db.AllocatedStorage,
          maxAllocatedStorageGB: db.MaxAllocatedStorage,
          storageType: db.StorageType,
          storageEncrypted: db.StorageEncrypted,
          kmsKeyId: db.KmsKeyId,
          iops: db.Iops,

          // Network
          ip: db.Endpoint?.Address,
          endpoint: db.Endpoint?.Address,
          port: db.Endpoint?.Port,
          hostedZoneId: db.Endpoint?.HostedZoneId,
          vpc: db.DBSubnetGroup?.VpcId,
          subnetGroup: db.DBSubnetGroup?.DBSubnetGroupName,
          securityGroups: (db.VpcSecurityGroups || []).map(sg => ({ id: sg.VpcSecurityGroupId, status: sg.Status })),
          publiclyAccessible: db.PubliclyAccessible,
          // Mark private/public access for frontend filtering
          isPrivate: db.PubliclyAccessible === false || !db.Endpoint?.Address,
          networkAccess: db.PubliclyAccessible ? 'public' : 'private',

          // HA & backup
          multiAZ: db.MultiAZ,
          backupRetentionPeriod: db.BackupRetentionPeriod,
          preferredBackupWindow: db.PreferredBackupWindow,
          preferredMaintenanceWindow: db.PreferredMaintenanceWindow,
          latestRestorableTime: db.LatestRestorableTime,
          deletionProtection: db.DeletionProtection,
          replicaCount: db.ReadReplicaDBInstanceIdentifiers?.length || 0,
          readReplicaIds: db.ReadReplicaDBInstanceIdentifiers || [],
          sourceDbId: db.ReadReplicaSourceDBInstanceIdentifier || null,
          autoMinorVersionUpgrade: db.AutoMinorVersionUpgrade,
          parameterGroup: db.DBParameterGroups?.[0]?.DBParameterGroupName,

          // Metrics
          cpu: cpu ?? null,
          dbConnections: conns ? Math.round(conns) : null,
          freeStorageGB: freeStorage ? Math.round(freeStorage / 1073741824 * 10) / 10 : null,
          readIOPS: readIOPS ?? null,
          writeIOPS: writeIOPS ?? null,

          launchTime: db.InstanceCreateTime,
          uptime: db.InstanceCreateTime ? formatUptime(db.InstanceCreateTime) : null,
          cost: estimateMonthlyCost({ instanceType: db.DBInstanceClass, family: 'Database' }),
          tags: Object.fromEntries((db.TagList || []).map(t => [t.Key, t.Value])),
          connections: [],
        });
      }
      return instances;
    } catch (e) {
      console.error(`RDS error [${region}]:`, e.message);
      return [];
    }
  }

  async getS3Buckets() {
    try {
      const s3 = new S3Client(this.getClientConfig());
      const res = await s3.send(new ListBucketsCommand({}));
      const buckets = [];

      for (const b of (res.Buckets || []).slice(0, 50)) {
        let region = 'us-east-1';
        let objectCount = 0;
        let versioning = false;
        let encryption = null;
        let tags = {};
        let lifecycleRules = 0;
        let blockPublicAccess = false;

        // Get bucket region first so we can query CloudWatch in the right region
        await s3.send(new GetBucketLocationCommand({ Bucket: b.Name })).then(loc => {
          region = loc.LocationConstraint || 'us-east-1';
        }).catch(() => {});

        let policy = null;
        let objects = [];
        let objectsTotalSize = 0;
        let hasMoreObjects = false;

        await Promise.allSettled([
          s3.send(new GetBucketVersioningCommand({ Bucket: b.Name })).then(v => {
            versioning = v.Status === 'Enabled';
          }),
          s3.send(new GetBucketEncryptionCommand({ Bucket: b.Name })).then(enc => {
            const rule = enc.ServerSideEncryptionConfiguration?.Rules?.[0]?.ApplyServerSideEncryptionByDefault;
            encryption = rule?.SSEAlgorithm || null;
          }),
          s3.send(new GetBucketTaggingCommand({ Bucket: b.Name })).then(t => {
            tags = Object.fromEntries((t.TagSet || []).map(t => [t.Key, t.Value]));
          }),
          s3.send(new GetBucketLifecycleConfigurationCommand({ Bucket: b.Name })).then(lc => {
            lifecycleRules = (lc.Rules || []).length;
          }),
          s3.send(new GetPublicAccessBlockCommand({ Bucket: b.Name })).then(pab => {
            const cfg = pab.PublicAccessBlockConfiguration || {};
            blockPublicAccess = !!(cfg.BlockPublicAcls || cfg.BlockPublicPolicy || cfg.RestrictPublicBuckets || cfg.IgnorePublicAcls);
          }).catch(() => {}),
          // Bucket policy
          s3.send(new GetBucketPolicyCommand({ Bucket: b.Name })).then(p => {
            try { policy = JSON.parse(p.Policy); } catch { policy = p.Policy; }
          }).catch(() => {}),
          // Real object count via CloudWatch (no listing limit, accurate total)
          this.getS3ObjectCountFromCloudWatch(b.Name, region).then(count => {
            if (count != null) objectCount = count;
          }),
          // Paginated object listing â€” up to 2000 objects for file browser
          (async () => {
            try {
              let token;
              const MAX = 2000;
              do {
                const res = await s3.send(new ListObjectsV2Command({
                  Bucket: b.Name, MaxKeys: 1000, ContinuationToken: token,
                }));
                for (const obj of res.Contents || []) {
                  objects.push({
                    key: obj.Key,
                    size: obj.Size || 0,
                    lastModified: obj.LastModified,
                    storageClass: obj.StorageClass,
                  });
                  objectsTotalSize += obj.Size || 0;
                }
                hasMoreObjects = res.IsTruncated && objects.length >= MAX;
                token = res.IsTruncated && objects.length < MAX ? res.NextContinuationToken : undefined;
              } while (token);
            } catch {}
          })(),
        ]);

        // Real bucket size via CloudWatch BucketSizeBytes (accurate, includes all objects, no 1000-object limit)
        const cwSizeGB = await this.getS3BucketSizeFromCloudWatch(b.Name, region);
        const sizeGB = cwSizeGB ?? 0;
        buckets.push({
          id: `aws-s3-${b.Name}`,
          rawId: b.Name,
          name: b.Name,
          type: 'S3 Bucket',
          family: 'Storage',
          provider: 'aws',
          region,
          status: 'Active',
          health: 'healthy',
          objectCount,
          sizeGB,
          sizeMB: Math.round(sizeGB * 1024 * 100) / 100,
          versioning,
          encryption,
          lifecycleRules,
          blockPublicAccess,
          isPrivate: blockPublicAccess,
          networkAccess: blockPublicAccess ? 'private' : 'public',
          creationDate: b.CreationDate,
          cost: Math.max(1, sizeGB * 0.023),
          policy,
          objects,
          objectsTotalSizeBytes: objectsTotalSize,
          hasMoreObjects,
          tags,
          connections: [],
        });
      }
      return buckets;
    } catch (e) {
      console.error('S3 error:', e.message);
      return [];
    }
  }

  async getLambdaFunctions(region) {
    try {
      const lambda = new LambdaClient(this.getClientConfig(region));
      const res = await lambda.send(new ListFunctionsCommand({ MaxItems: 50 }));
      const functions = [];

      for (const fn of res.Functions || []) {
        const [invocations, errors, duration, throttles, concurrency, fnDetail] = await Promise.all([
          this.getMetric('AWS/Lambda', 'Invocations', [{ Name: 'FunctionName', Value: fn.FunctionName }], region),
          this.getMetric('AWS/Lambda', 'Errors', [{ Name: 'FunctionName', Value: fn.FunctionName }], region),
          this.getMetric('AWS/Lambda', 'Duration', [{ Name: 'FunctionName', Value: fn.FunctionName }], region),
          this.getMetric('AWS/Lambda', 'Throttles', [{ Name: 'FunctionName', Value: fn.FunctionName }], region),
          lambda.send(new GetFunctionConcurrencyCommand({ FunctionName: fn.FunctionName })).catch(() => null),
          lambda.send(new GetFunctionCommand({ FunctionName: fn.FunctionName })).catch(() => null),
        ]);

        const config = fnDetail?.Configuration || fn;
        functions.push({
          id: `aws-lambda-${fn.FunctionArn?.split(':').pop() || fn.FunctionName}`,
          rawId: fn.FunctionName,
          name: fn.FunctionName,
          type: 'Lambda Function',
          family: 'Serverless',
          provider: 'aws',
          region,
          status: fn.State || 'Active',
          health: fn.State === 'Active' ? 'healthy' : healthFromStatus(fn.State),

          // Runtime & code
          runtime: fn.Runtime,
          handler: fn.Handler,
          codeSize: fn.CodeSize ? `${Math.round(fn.CodeSize / 1024)} KB` : null,
          codeSizeBytes: fn.CodeSize,
          description: fn.Description,
          functionArn: fn.FunctionArn,

          // Resources
          memorySize: fn.MemorySize,
          memorySizeMB: fn.MemorySize,
          timeout: fn.Timeout,
          ephemeralStorageMB: config.EphemeralStorage?.Size || 512,

          // Network
          vpc: config.VpcConfig?.VpcId || null,
          subnets: config.VpcConfig?.SubnetIds || [],
          securityGroupIds: config.VpcConfig?.SecurityGroupIds || [],
          isPrivate: !!(config.VpcConfig?.VpcId),
          networkAccess: config.VpcConfig?.VpcId ? 'private' : 'public',

          // Concurrency
          reservedConcurrency: concurrency?.ReservedConcurrentExecutions ?? null,

          // Layers
          layers: (fn.Layers || []).map(l => ({ arn: l.Arn, codeSize: l.CodeSize })),

          // Environment (keys only, not values for security)
          envVarKeys: Object.keys(fn.Environment?.Variables || {}),

          // Metadata
          lastModified: fn.LastModified,
          iamRole: fn.Role?.split('/').pop() || null,
          iamRoleArn: fn.Role,
          architectures: fn.Architectures || ['x86_64'],
          packageType: fn.PackageType,
          stateReason: fn.StateReason,
          stateReasonCode: fn.StateReasonCode,

          // Metrics
          invocations: invocations ? Math.round(invocations * 24 * 30) : null,
          errors: errors ? Math.round(errors) : null,
          duration: duration ? Math.round(duration) : null,
          throttles: throttles ? Math.round(throttles) : 0,

          cost: 0.5 + Math.random() * 3,
          tags: Object.fromEntries(Object.entries(fn.Tags || {})),
          connections: [],
        });
      }
      return functions;
    } catch (e) {
      console.error(`Lambda error [${region}]:`, e.message);
      return [];
    }
  }

  async getEKSClusters(region) {
    try {
      const eks = new EKSClient(this.getClientConfig(region));
      const list = await eks.send(new ListClustersCommand({}));
      const clusters = [];

      for (const name of list.clusters || []) {
        const detail = await eks.send(new DescribeClusterCommand({ name }));
        const c = detail.cluster;

        let nodes = 0;
        let nodeGroupDetails = [];
        let addons = [];

        await Promise.allSettled([
          eks.send(new ListNodegroupsCommand({ clusterName: name })).then(async ngList => {
            for (const ng of ngList.nodegroups || []) {
              try {
                const ngDetail = await eks.send(new DescribeNodegroupCommand({ clusterName: name, nodegroupName: ng }));
                const ngd = ngDetail.nodegroup;
                nodes += ngd?.scalingConfig?.desiredSize || 0;
                nodeGroupDetails.push({
                  name: ng,
                  status: ngd?.status,
                  instanceTypes: ngd?.instanceTypes || [],
                  desiredSize: ngd?.scalingConfig?.desiredSize,
                  minSize: ngd?.scalingConfig?.minSize,
                  maxSize: ngd?.scalingConfig?.maxSize,
                  amiType: ngd?.amiType,
                  diskSizeGB: ngd?.diskSize,
                  releaseVersion: ngd?.releaseVersion,
                  labels: ngd?.labels || {},
                });
              } catch {}
            }
          }),
          eks.send(new ListAddonsCommand({ clusterName: name })).then(async addonList => {
            for (const addon of addonList.addons || []) {
              try {
                const addonDetail = await eks.send(new DescribeAddonCommand({ clusterName: name, addonName: addon }));
                addons.push({
                  name: addon,
                  version: addonDetail.addon?.addonVersion,
                  status: addonDetail.addon?.status,
                });
              } catch {}
            }
          }),
        ]);

        const cpu = await this.getMetric('ContainerInsights', 'cluster_cpu_utilization',
          [{ Name: 'ClusterName', Value: name }], region);

        clusters.push({
          id: `aws-eks-${name}`,
          rawId: name,
          name,
          type: 'EKS Cluster',
          family: 'Container',
          provider: 'aws',
          region,
          status: c.status,
          health: c.status === 'ACTIVE' ? 'healthy' : healthFromStatus(c.status),
          kubernetesVersion: c.version,
          endpoint: c.endpoint,
          endpointPublicAccess: c.resourcesVpcConfig?.endpointPublicAccess,
          endpointPrivateAccess: c.resourcesVpcConfig?.endpointPrivateAccess,
          isPrivate: c.resourcesVpcConfig?.endpointPublicAccess === false,
          networkAccess: c.resourcesVpcConfig?.endpointPublicAccess === false ? 'private' : 'public',
          vpc: c.resourcesVpcConfig?.vpcId,
          subnets: c.resourcesVpcConfig?.subnetIds || [],
          securityGroups: c.resourcesVpcConfig?.securityGroupIds || [],
          clusterSecurityGroupId: c.resourcesVpcConfig?.clusterSecurityGroupId,
          nodes,
          nodeGroups: nodeGroupDetails.length,
          nodeGroupDetails,
          addons,
          pods: nodes * 10,
          runningPods: nodes * 9,
          loggingEnabled: c.logging?.clusterLogging?.some(l => l.enabled) || false,
          encryptionConfig: c.encryptionConfig?.length > 0,
          roleArn: c.roleArn,
          cpu: cpu ?? null,
          createdAt: c.createdAt,
          launchTime: c.createdAt,
          uptime: c.createdAt ? formatUptime(c.createdAt) : null,
          cost: estimateMonthlyCost({ family: 'Container' }) * (nodes || 1),
          tags: c.tags || {},
          connections: [],
        });
      }
      return clusters;
    } catch (e) {
      console.error(`EKS error [${region}]:`, e.message);
      return [];
    }
  }

  async getElastiCacheClusters(region) {
    try {
      const ec = new ElastiCacheClient(this.getClientConfig(region));
      const res = await ec.send(new DescribeCacheClustersCommand({ ShowCacheNodeInfo: true }));
      return (res.CacheClusters || []).map(c => ({
        id: `aws-elasticache-${c.CacheClusterId}`,
        rawId: c.CacheClusterId,
        name: c.CacheClusterId,
        type: 'ElastiCache Cluster',
        family: 'Cache',
        provider: 'aws',
        region,
        az: c.PreferredAvailabilityZone,
        status: c.CacheClusterStatus,
        health: c.CacheClusterStatus === 'available' ? 'healthy' : healthFromStatus(c.CacheClusterStatus),
        engine: c.Engine,
        engineVersion: c.EngineVersion,
        instanceType: c.CacheNodeType,
        numNodes: c.NumCacheNodes,
        endpoint: c.ConfigurationEndpoint?.Address || c.CacheNodes?.[0]?.Endpoint?.Address,
        port: c.ConfigurationEndpoint?.Port || c.CacheNodes?.[0]?.Endpoint?.Port,
        subnetGroup: c.CacheSubnetGroupName,
        securityGroups: (c.SecurityGroups || []).map(sg => ({ id: sg.SecurityGroupId, status: sg.Status })),
        isPrivate: true,
        networkAccess: 'private',
        snapshotRetentionLimit: c.SnapshotRetentionLimit,
        autoMinorVersionUpgrade: c.AutoMinorVersionUpgrade,
        transitEncryption: c.TransitEncryptionEnabled,
        atRestEncryption: c.AtRestEncryptionEnabled,
        replicationGroupId: c.ReplicationGroupId,
        launchTime: c.CacheClusterCreateTime,
        uptime: c.CacheClusterCreateTime ? formatUptime(c.CacheClusterCreateTime) : null,
        cost: estimateMonthlyCost({ instanceType: c.CacheNodeType, family: 'Cache' }),
        connections: [],
        tags: {},
      }));
    } catch (e) {
      console.error(`ElastiCache error [${region}]:`, e.message);
      return [];
    }
  }

  async getLoadBalancers(region) {
    try {
      const elbv2 = new ElasticLoadBalancingV2Client(this.getClientConfig(region));
      const res = await elbv2.send(new DescribeLoadBalancersCommand({}));
      const lbs = [];
      for (const lb of res.LoadBalancers || []) {
        let listeners = [];
        try {
          const listenersRes = await elbv2.send(new DescribeListenersCommand({ LoadBalancerArn: lb.LoadBalancerArn }));
          listeners = (listenersRes.Listeners || []).map(l => ({
            port: l.Port,
            protocol: l.Protocol,
            sslPolicy: l.SslPolicy,
          }));
        } catch {}

        lbs.push({
          id: `aws-alb-${lb.LoadBalancerName}`,
          rawId: lb.LoadBalancerArn,
          name: lb.LoadBalancerName,
          type: `${lb.Type?.toUpperCase() || 'ALB'} Load Balancer`,
          family: 'Networking',
          provider: 'aws',
          region,
          az: lb.AvailabilityZones?.map(az => az.ZoneName).join(', '),
          status: lb.State?.Code,
          health: lb.State?.Code === 'active' ? 'healthy' : healthFromStatus(lb.State?.Code),
          dnsName: lb.DNSName,
          hostedZoneId: lb.CanonicalHostedZoneId,
          scheme: lb.Scheme,
          isPrivate: lb.Scheme === 'internal',
          networkAccess: lb.Scheme === 'internal' ? 'private' : 'public',
          vpc: lb.VpcId,
          ipAddressType: lb.IpAddressType,
          securityGroups: lb.SecurityGroups || [],
          listeners,
          launchTime: lb.CreatedTime,
          uptime: lb.CreatedTime ? formatUptime(lb.CreatedTime) : null,
          cost: 25 + Math.random() * 15,
          connections: [],
          tags: {},
        });
      }
      return lbs;
    } catch (e) {
      console.error(`ALB error [${region}]:`, e.message);
      return [];
    }
  }

  async getSQSQueues(region) {
    try {
      const sqs = new SQSClient(this.getClientConfig(region));
      const res = await sqs.send(new ListQueuesCommand({ MaxResults: 50 }));
      const queues = [];
      for (const url of (res.QueueUrls || []).slice(0, 20)) {
        const name = url.split('/').pop();
        try {
          const attrs = await sqs.send(new GetQueueAttributesCommand({
            QueueUrl: url,
            AttributeNames: ['All'],
          }));
          const a = attrs.Attributes || {};
          queues.push({
            id: `aws-sqs-${name}`,
            rawId: url,
            name,
            type: 'SQS Queue',
            family: 'Messaging',
            provider: 'aws',
            region,
            status: 'Active',
            health: 'healthy',
            messages: parseInt(a.ApproximateNumberOfMessages) || 0,
            messagesInFlight: parseInt(a.ApproximateNumberOfMessagesNotVisible) || 0,
            messagesDelayed: parseInt(a.ApproximateNumberOfMessagesDelayed) || 0,
            retentionPeriodSec: parseInt(a.MessageRetentionPeriod) || 0,
            visibilityTimeoutSec: parseInt(a.VisibilityTimeout) || 30,
            maxMessageSizeBytes: parseInt(a.MaximumMessageSize) || 262144,
            receiveWaitTimeSec: parseInt(a.ReceiveMessageWaitTimeSeconds) || 0,
            isFifo: name.endsWith('.fifo'),
            isContentBased: a.ContentBasedDeduplication === 'true',
            dlqArn: a.RedrivePolicy ? JSON.parse(a.RedrivePolicy)?.deadLetterTargetArn : null,
            kmsKeyId: a.KmsMasterKeyId || null,
            queueArn: a.QueueArn,
            createdAt: a.CreatedTimestamp ? new Date(parseInt(a.CreatedTimestamp) * 1000).toISOString() : null,
            cost: 1 + Math.random() * 5,
            connections: [],
            tags: {},
          });
        } catch {}
      }
      return queues;
    } catch (e) {
      console.error(`SQS error [${region}]:`, e.message);
      return [];
    }
  }

  async getVPCs(region) {
    try {
      const ec2 = new EC2Client(this.getClientConfig(region));
      const [vpcsRes, subnetsRes, igwsRes, natGwsRes] = await Promise.all([
        ec2.send(new DescribeVpcsCommand({})),
        ec2.send(new DescribeSubnetsCommand({})),
        ec2.send(new DescribeInternetGatewaysCommand({})),
        ec2.send(new DescribeNatGatewaysCommand({})).catch(() => ({ NatGateways: [] })),
      ]);

      const subnetsByVpc = {};
      for (const s of subnetsRes.Subnets || []) {
        if (!subnetsByVpc[s.VpcId]) subnetsByVpc[s.VpcId] = [];
        subnetsByVpc[s.VpcId].push({
          id: s.SubnetId,
          cidr: s.CidrBlock,
          az: s.AvailabilityZone,
          public: s.MapPublicIpOnLaunch,
          availableIps: s.AvailableIpAddressCount,
          name: s.Tags?.find(t => t.Key === 'Name')?.Value,
        });
      }

      const igwsByVpc = {};
      for (const igw of igwsRes.InternetGateways || []) {
        for (const att of igw.Attachments || []) {
          igwsByVpc[att.VpcId] = { id: igw.InternetGatewayId, state: att.State };
        }
      }

      const natsByVpc = {};
      for (const nat of natGwsRes.NatGateways || []) {
        if (!natsByVpc[nat.VpcId]) natsByVpc[nat.VpcId] = [];
        natsByVpc[nat.VpcId].push({
          id: nat.NatGatewayId,
          state: nat.State,
          subnetId: nat.SubnetId,
          publicIp: nat.NatGatewayAddresses?.[0]?.PublicIp,
          privateIp: nat.NatGatewayAddresses?.[0]?.PrivateIp,
        });
      }

      return (vpcsRes.Vpcs || []).map(v => ({
        id: `aws-vpc-${v.VpcId}`,
        rawId: v.VpcId,
        name: v.Tags?.find(t => t.Key === 'Name')?.Value || v.VpcId,
        type: 'VPC',
        family: 'Networking',
        provider: 'aws',
        region,
        status: v.State,
        health: v.State === 'available' ? 'healthy' : healthFromStatus(v.State),
        cidr: v.CidrBlock,
        ipv6Cidr: v.Ipv6CidrBlockAssociationSet?.[0]?.Ipv6CidrBlock || null,
        isDefault: v.IsDefault,
        isPrivate: !igwsByVpc[v.VpcId],
        networkAccess: igwsByVpc[v.VpcId] ? 'public' : 'private',
        dhcpOptionsId: v.DhcpOptionsId,
        tenancy: v.InstanceTenancy,
        subnets: subnetsByVpc[v.VpcId] || [],
        internetGateway: igwsByVpc[v.VpcId] || null,
        natGateways: natsByVpc[v.VpcId] || [],
        cost: 0,
        tags: Object.fromEntries((v.Tags || []).map(t => [t.Key, t.Value])),
        connections: [],
      }));
    } catch (e) {
      return [];
    }
  }

  async getAllSecurityGroups(region) {
    try {
      const ec2 = new EC2Client(this.getClientConfig(region));
      const res = await ec2.send(new DescribeSecurityGroupsCommand({}));
      return (res.SecurityGroups || []).map(sg => ({
        id: `aws-sg-${sg.GroupId}`,
        rawId: sg.GroupId,
        name: sg.GroupName,
        type: 'Security Group',
        family: 'Security',
        provider: 'aws',
        region,
        vpcId: sg.VpcId,
        description: sg.Description,
        health: 'healthy',
        status: 'active',
        inboundRules: (sg.IpPermissions || []).map(p => ({
          protocol: p.IpProtocol === '-1' ? 'All' : p.IpProtocol,
          fromPort: p.FromPort,
          toPort: p.ToPort,
          sources: [
            ...(p.IpRanges  || []).map(r => ({ type: 'cidr',  value: r.CidrIp,     desc: r.Description || '' })),
            ...(p.Ipv6Ranges || []).map(r => ({ type: 'cidr6', value: r.CidrIpv6,   desc: r.Description || '' })),
            ...(p.UserIdGroupPairs || []).map(r => ({ type: 'sg', value: r.GroupId, name: r.GroupName || '', desc: r.Description || '' })),
          ],
        })),
        outboundRules: (sg.IpPermissionsEgress || []).map(p => ({
          protocol: p.IpProtocol === '-1' ? 'All' : p.IpProtocol,
          fromPort: p.FromPort,
          toPort: p.ToPort,
          destinations: [
            ...(p.IpRanges  || []).map(r => ({ type: 'cidr',  value: r.CidrIp,     desc: r.Description || '' })),
            ...(p.Ipv6Ranges || []).map(r => ({ type: 'cidr6', value: r.CidrIpv6,   desc: r.Description || '' })),
            ...(p.UserIdGroupPairs || []).map(r => ({ type: 'sg', value: r.GroupId, name: r.GroupName || '', desc: r.Description || '' })),
          ],
        })),
        cost: 0,
        tags: Object.fromEntries((sg.Tags || []).map(t => [t.Key, t.Value])),
        connections: [],
      }));
    } catch (e) {
      console.error(`Security groups error [${region}]:`, e.message);
      return [];
    }
  }

  async getRouteTables(region) {
    try {
      const ec2 = new EC2Client(this.getClientConfig(region));
      const res = await ec2.send(new DescribeRouteTablesCommand({}));
      return (res.RouteTables || []).map(rt => ({
        id: `aws-rt-${rt.RouteTableId}`,
        rawId: rt.RouteTableId,
        name: rt.Tags?.find(t => t.Key === 'Name')?.Value || rt.RouteTableId,
        type: 'Route Table',
        family: 'Networking',
        provider: 'aws',
        region,
        vpcId: rt.VpcId,
        isMain: (rt.Associations || []).some(a => a.Main),
        associations: (rt.Associations || []).map(a => ({
          id: a.RouteTableAssociationId,
          subnetId: a.SubnetId || null,
          isMain: a.Main || false,
          state: a.AssociationState?.State || 'associated',
        })),
        routes: (rt.Routes || []).map(r => ({
          destination: r.DestinationCidrBlock || r.DestinationIpv6CidrBlock || r.DestinationPrefixListId || 'â€”',
          target: r.GatewayId || r.NatGatewayId || r.TransitGatewayId || r.VpcPeeringConnectionId || r.NetworkInterfaceId || r.InstanceId || 'local',
          state: r.State,
          origin: r.Origin,
        })),
        health: 'healthy',
        status: 'active',
        cost: 0,
        tags: Object.fromEntries((rt.Tags || []).map(t => [t.Key, t.Value])),
        connections: [],
      }));
    } catch (e) {
      console.error(`Route tables error [${region}]:`, e.message);
      return [];
    }
  }

  async getAlerts(region) {
    try {
      const cw = new CloudWatchClient(this.getClientConfig(region));
      const res = await cw.send(new DescribeAlarmsCommand({
        StateValue: 'ALARM',
        MaxRecords: 50,
      }));
      return (res.MetricAlarms || []).map(a => ({
        id: `aws-alarm-${a.AlarmName}`,
        title: a.AlarmName,
        message: a.AlarmDescription || `${a.MetricName} threshold exceeded`,
        severity: a.AlarmName.toLowerCase().includes('critical') ? 'critical' :
          a.AlarmName.toLowerCase().includes('error') ? 'critical' : 'warning',
        provider: 'aws',
        service: a.Dimensions?.[0]?.Value || 'Unknown',
        region,
        time: new Date(a.StateUpdatedTimestamp).toISOString(),
        acknowledged: false,
        raw: { state: a.StateValue, metric: a.MetricName, namespace: a.Namespace },
      }));
    } catch (e) {
      console.error(`CloudWatch alarms error [${region}]:`, e.message);
      return [];
    }
  }

  // Discover EFS filesystems and their real storage usage via CloudWatch StorageBytes
  // No EFS SDK or agent required â€” just access keys with cloudwatch:GetMetricStatistics
  async getEFSStorageFromCloudWatch(region) {
    try {
      const cw = new CloudWatchClient(this.getClientConfig(region));
      const listRes = await cw.send(new ListMetricsCommand({
        Namespace: 'AWS/EFS',
        MetricName: 'StorageBytes',
        Dimensions: [{ Name: 'StorageClass', Value: 'Total' }],
      }));
      const metrics = listRes.Metrics || [];
      if (!metrics.length) return [];

      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);

      const resources = await Promise.all(metrics.map(async metric => {
        const fsId = metric.Dimensions.find(d => d.Name === 'FileSystemId')?.Value;
        if (!fsId) return null;
        try {
          const res = await cw.send(new GetMetricStatisticsCommand({
            Namespace: 'AWS/EFS',
            MetricName: 'StorageBytes',
            Dimensions: metric.Dimensions,
            StartTime: startTime,
            EndTime: endTime,
            Period: 3600,
            Statistics: ['Average'],
          }));
          const latest = (res.Datapoints || []).sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp))[0];
          if (latest?.Average == null) return null;
          const sizeGB = Math.round(latest.Average / 1073741824 * 100) / 100;
          return {
            id: `aws-efs-${fsId}`,
            rawId: fsId,
            name: fsId,
            type: 'EFS Filesystem',
            family: 'Storage',
            provider: 'aws',
            region,
            status: 'Active',
            health: 'healthy',
            sizeGB,
            cost: Math.max(0.1, sizeGB * 0.30),
            tags: {},
            connections: [],
          };
        } catch { return null; }
      }));
      return resources.filter(Boolean);
    } catch { return []; }
  }

  // â”€â”€ Route 53 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getRoute53HostedZones() {
    try {
      const r53 = new Route53Client(this.getClientConfig());
      const res = await r53.send(new ListHostedZonesCommand({ MaxItems: '100' }));
      const zones = [];
      for (const z of res.HostedZones || []) {
        const zoneId = z.Id.split('/').pop();
        let recordCount = 0;
        try {
          const rr = await r53.send(new ListResourceRecordSetsCommand({ HostedZoneId: zoneId, MaxItems: '1' }));
          recordCount = z.ResourceRecordSetCount || 0;
        } catch {}
        zones.push({
          id: `aws-r53-${zoneId}`,
          rawId: zoneId,
          name: z.Name.replace(/\.$/, ''),
          type: 'Route 53 Hosted Zone',
          family: 'DNS',
          provider: 'aws',
          region: 'global',
          status: 'Active',
          health: 'healthy',
          isPrivate: z.Config?.PrivateZone || false,
          networkAccess: z.Config?.PrivateZone ? 'private' : 'public',
          recordCount,
          comment: z.Config?.Comment || null,
          cost: 0.50,
          tags: {},
          connections: [],
        });
      }
      return zones;
    } catch (e) {
      console.error('Route 53 error:', e.message);
      return [];
    }
  }

  // â”€â”€ CloudWatch Alarms as resources â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getCloudWatchAlarmResources(region) {
    try {
      const cw = new CloudWatchClient(this.getClientConfig(region));
      const res = await cw.send(new DescribeAlarmsCommand({ MaxRecords: 100 }));
      return (res.MetricAlarms || []).map(a => ({
        id: `aws-cw-alarm-${region}-${a.AlarmName.replace(/\s+/g, '-')}`,
        rawId: a.AlarmArn,
        name: a.AlarmName,
        type: 'CloudWatch Alarm',
        family: 'Monitoring',
        provider: 'aws',
        region,
        status: a.StateValue,
        health: a.StateValue === 'OK' ? 'healthy' : a.StateValue === 'ALARM' ? 'critical' : 'warning',
        metricName: a.MetricName,
        namespace: a.Namespace,
        comparisonOperator: a.ComparisonOperator,
        threshold: a.Threshold,
        period: a.Period,
        alarmDescription: a.AlarmDescription || null,
        stateReason: a.StateReason || null,
        alarmActions: a.AlarmActions || [],
        cost: 0.10,
        uptime: null,
        tags: {},
        connections: [],
      }));
    } catch (e) {
      console.error(`CloudWatch alarm resources error [${region}]:`, e.message);
      return [];
    }
  }

  // â”€â”€ Lightsail â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getLightsailInstances(region) {
    try {
      const ls = new LightsailClient(this.getClientConfig(region));
      const [instRes, dbRes] = await Promise.allSettled([
        ls.send(new LightsailGetInstancesCommand({})),
        ls.send(new GetDatabasesCommand({})),
      ]);
      const resources = [];

      for (const i of instRes.value?.instances || []) {
        resources.push({
          id: `aws-ls-${i.name}`,
          rawId: i.arn,
          name: i.name,
          type: 'Lightsail Instance',
          family: 'Compute',
          provider: 'aws',
          region: i.location?.regionName || region,
          az: i.location?.availabilityZone,
          status: i.state?.name || 'unknown',
          health: i.state?.name === 'running' ? 'healthy' : healthFromStatus(i.state?.name),
          ip: i.privateIpAddress,
          publicIp: i.publicIpAddress,
          blueprintName: i.blueprintName,
          bundleId: i.bundleId,
          vcpu: i.hardware?.cpuCount,
          memGiB: i.hardware?.ramSizeInGb,
          storageGB: (i.hardware?.disks || []).reduce((a, d) => a + (d.sizeInGb || 0), 0),
          launchTime: i.createdAt,
          uptime: i.createdAt ? formatUptime(i.createdAt) : null,
          cost: estimateMonthlyCost({ family: 'Compute' }),
          tags: Object.fromEntries((i.tags || []).map(t => [t.key, t.value])),
          connections: [],
        });
      }

      for (const db of dbRes.value?.relationalDatabases || []) {
        resources.push({
          id: `aws-ls-db-${db.name}`,
          rawId: db.arn,
          name: db.name,
          type: 'Lightsail Database',
          family: 'Database',
          provider: 'aws',
          region: db.location?.regionName || region,
          status: db.state,
          health: db.state === 'available' ? 'healthy' : healthFromStatus(db.state),
          engine: db.relationalDatabaseBlueprintId,
          endpoint: db.masterEndpoint?.address,
          port: db.masterEndpoint?.port,
          launchTime: db.createdAt,
          uptime: db.createdAt ? formatUptime(db.createdAt) : null,
          cost: estimateMonthlyCost({ family: 'Database' }),
          tags: Object.fromEntries((db.tags || []).map(t => [t.key, t.value])),
          connections: [],
        });
      }

      return resources;
    } catch (e) {
      console.error(`Lightsail error [${region}]:`, e.message);
      return [];
    }
  }

  async getAllResources() {
    // Determine regions to scan: explicit creds.regions, environment override, 'all' keyword, or default region
    const envRegions = process.env.AWS_REGIONS ? process.env.AWS_REGIONS.split(',').map(r => r.trim()).filter(Boolean) : null;
    let regions = this.creds.regions || envRegions || [this.region];
    if (Array.isArray(regions) && regions.length === 1 && regions[0] === 'all') regions = AWS_REGIONS;
    if (regions === 'all') regions = AWS_REGIONS;

    // Fetch S3 first so we can auto-add any bucket regions not already in the scan list
    const s3Resources = await this.getS3Buckets();
    const s3Regions = [...new Set(s3Resources.map(b => b.region).filter(Boolean))];
    const allRegions = [...new Set([...regions, ...s3Regions])];

    const results = await Promise.allSettled([
      // Route 53 & Lightsail are global/single-region calls
      this.getRoute53HostedZones(),
      this.getLightsailInstances(this.region),
      ...allRegions.flatMap(r => [
        this.getEC2Instances(r),
        this.getRDSInstances(r),
        this.getLambdaFunctions(r),
        this.getEKSClusters(r),
        this.getElastiCacheClusters(r),
        this.getLoadBalancers(r),
        this.getSQSQueues(r),
        this.getVPCs(r),
        this.getAllSecurityGroups(r),
        this.getRouteTables(r),
        this.getEFSStorageFromCloudWatch(r),
        this.getCloudWatchAlarmResources(r),
      ]),
    ]);

    let allResources = [...s3Resources];
    for (const r of results) {
      if (r.status === 'fulfilled') allResources = allResources.concat(r.value);
    }
    buildConnectionGraph(allResources);
    return allResources;
  }

  async getAlertsAllRegions() {
    const envRegions = process.env.AWS_REGIONS ? process.env.AWS_REGIONS.split(',').map(r => r.trim()).filter(Boolean) : null;
    let regions = this.creds.regions || envRegions || [this.region];
    if (Array.isArray(regions) && regions.length === 1 && regions[0] === 'all') regions = AWS_REGIONS;
    if (regions === 'all') regions = AWS_REGIONS;
    const results = await Promise.allSettled(regions.map(r => this.getAlerts(r)));
    let all = [];
    for (const r of results) {
      if (r.status === 'fulfilled') all = all.concat(r.value);
    }
    return all;
  }
}

function buildConnectionGraph(resources) {
  const byVpc = {};
  const bySubnet = {};
  for (const r of resources) {
    if (r.vpc) {
      if (!byVpc[r.vpc]) byVpc[r.vpc] = [];
      byVpc[r.vpc].push(r.id);
    }
    if (r.subnet) {
      if (!bySubnet[r.subnet]) bySubnet[r.subnet] = [];
      bySubnet[r.subnet].push(r.id);
    }
  }
  for (const r of resources) {
    const conns = new Set();
    if (r.vpc && byVpc[r.vpc]) {
      byVpc[r.vpc].filter(id => id !== r.id).slice(0, 5).forEach(id => conns.add(id));
    }
    if (r.subnet && bySubnet[r.subnet]) {
      bySubnet[r.subnet].filter(id => id !== r.id).forEach(id => conns.add(id));
    }
    r.connections = Array.from(conns).slice(0, 8);
  }
}

function formatUptime(since) {
  const ms = Date.now() - new Date(since).getTime();
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  if (d > 0) return `${d}d ${h}h`;
  return `${h}h`;
}

// gcpService
// services/gcpService.js
const { google } = require('googleapis');

// GCP machine type memory/vCPU lookup fallback
const GCP_MACHINE_SPECS = {
  'n1-standard-1': { vcpu: 1, memGiB: 3.75 }, 'n1-standard-2': { vcpu: 2, memGiB: 7.5 },
  'n1-standard-4': { vcpu: 4, memGiB: 15 }, 'n1-standard-8': { vcpu: 8, memGiB: 30 },
  'n1-standard-16': { vcpu: 16, memGiB: 60 }, 'n1-standard-32': { vcpu: 32, memGiB: 120 },
  'n2-standard-2': { vcpu: 2, memGiB: 8 }, 'n2-standard-4': { vcpu: 4, memGiB: 16 },
  'n2-standard-8': { vcpu: 8, memGiB: 32 }, 'n2-standard-16': { vcpu: 16, memGiB: 64 },
  'n2-standard-32': { vcpu: 32, memGiB: 128 },
  'e2-micro': { vcpu: 2, memGiB: 1 }, 'e2-small': { vcpu: 2, memGiB: 2 }, 'e2-medium': { vcpu: 2, memGiB: 4 },
  'e2-standard-2': { vcpu: 2, memGiB: 8 }, 'e2-standard-4': { vcpu: 4, memGiB: 16 },
  'e2-standard-8': { vcpu: 8, memGiB: 32 }, 'e2-standard-16': { vcpu: 16, memGiB: 64 },
  'c2-standard-4': { vcpu: 4, memGiB: 16 }, 'c2-standard-8': { vcpu: 8, memGiB: 32 },
  'c2-standard-16': { vcpu: 16, memGiB: 64 }, 'c2-standard-30': { vcpu: 30, memGiB: 120 },
  'n1-highmem-2': { vcpu: 2, memGiB: 13 }, 'n1-highmem-4': { vcpu: 4, memGiB: 26 },
  'n1-highmem-8': { vcpu: 8, memGiB: 52 }, 'n1-highmem-16': { vcpu: 16, memGiB: 104 },
  'n1-highcpu-4': { vcpu: 4, memGiB: 3.6 }, 'n1-highcpu-8': { vcpu: 8, memGiB: 7.2 },
  'n1-highcpu-16': { vcpu: 16, memGiB: 14.4 },
};

class GCPService {
  constructor(credentials) {
    this.creds = credentials;
    this.projectId = credentials.projectId;
    this.auth = null;
    this._machineTypeCache = {};
  }

  async getAuth() {
    if (this.auth) return this.auth;
    if (this.creds.authType === 'serviceAccount') {
      let keyData;
      try {
        keyData = typeof this.creds.serviceAccountKey === 'string'
          ? JSON.parse(this.creds.serviceAccountKey)
          : this.creds.serviceAccountKey;
      } catch {
        throw new Error('Invalid service account JSON');
      }
      this.auth = new google.auth.GoogleAuth({
        credentials: keyData,
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
    } else if (this.creds.authType === 'oauth') {
      const oauth2 = new google.auth.OAuth2();
      oauth2.setCredentials({ access_token: this.creds.accessToken });
      this.auth = oauth2;
    } else {
      this.auth = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
    }
    return this.auth;
  }

  async verifyConnection() {
    const auth = await this.getAuth();

    // Try Cloud Resource Manager first (gives project name + number)
    try {
      const crm = google.cloudresourcemanager({ version: 'v1', auth });
      const res = await crm.projects.get({ projectId: this.projectId });
      return { success: true, projectName: res.data.name, projectNumber: res.data.projectNumber };
    } catch (crmErr) {
      const isApiDisabled = crmErr.message && (
        crmErr.message.includes('has not been used') ||
        crmErr.message.includes('is disabled') ||
        crmErr.message.includes('SERVICE_DISABLED')
      );
      // Only fall back if the API is disabled — any other error (bad creds, wrong project) should fail
      if (!isApiDisabled) return { success: false, error: crmErr.message };
    }

    // Fallback: verify via Compute API (commonly enabled on all GCP projects)
    try {
      const compute = google.compute({ version: 'v1', auth });
      await compute.regions.list({ project: this.projectId, maxResults: 1 });
      return { success: true, projectName: this.projectId, projectNumber: null };
    } catch (computeErr) {
      const isComputeDisabled = computeErr.message && (
        computeErr.message.includes('has not been used') ||
        computeErr.message.includes('is disabled')
      );
      if (isComputeDisabled) {
        return {
          success: false,
          error: `Neither the Cloud Resource Manager API nor the Compute Engine API is enabled for project "${this.projectId}". Enable at least one at https://console.cloud.google.com/apis/library`,
        };
      }
      return { success: false, error: computeErr.message };
    }
  }

  // Fetch machine type specs (vCPU, memory) with cache
  async getMachineTypeSpecs(machineType, zone) {
    if (!machineType) return {};
    if (GCP_MACHINE_SPECS[machineType]) return GCP_MACHINE_SPECS[machineType];

    const cacheKey = `${zone}:${machineType}`;
    if (this._machineTypeCache[cacheKey]) return this._machineTypeCache[cacheKey];

    try {
      const auth = await this.getAuth();
      const compute = google.compute({ version: 'v1', auth });
      const res = await compute.machineTypes.get({
        project: this.projectId,
        zone,
        machineType,
      });
      const mt = res.data;
      const specs = {
        vcpu: mt.guestCpus || null,
        memGiB: mt.memoryMb ? Math.round(mt.memoryMb / 1024 * 10) / 10 : null,
        memMB: mt.memoryMb || null,
        description: mt.description || null,
        isSharedCpu: mt.isSharedCpu || false,
      };
      this._machineTypeCache[cacheKey] = specs;
      return specs;
    } catch {
      this._machineTypeCache[cacheKey] = {};
      return {};
    }
  }

  // Detect OS from disk license URL
  detectOS(licenses) {
    if (!licenses || !licenses.length) return 'Linux';
    const license = licenses[0].toLowerCase();
    if (license.includes('windows')) return 'Windows Server';
    if (license.includes('debian')) return 'Debian';
    if (license.includes('ubuntu')) return 'Ubuntu';
    if (license.includes('centos')) return 'CentOS';
    if (license.includes('rhel') || license.includes('red-hat')) return 'RHEL';
    if (license.includes('suse') || license.includes('sles')) return 'SUSE Linux';
    if (license.includes('cos') || license.includes('container-vm')) return 'Container-Optimized OS';
    if (license.includes('coreos')) return 'CoreOS';
    return 'Linux';
  }

  async getComputeInstances() {
    try {
      const auth = await this.getAuth();
      const compute = google.compute({ version: 'v1', auth });
      const res = await compute.instances.aggregatedList({
        project: this.projectId,
        maxResults: 100,
      });
      const instances = [];
      const items = res.data.items || {};

      for (const [zone, data] of Object.entries(items)) {
        for (const vm of data.instances || []) {
          const zoneName = zone.replace('zones/', '');
          const region = zoneName.split('-').slice(0, -1).join('-');
          const machineType = vm.machineType?.split('/').pop();

          // Fetch machine type specs
          const specs = await this.getMachineTypeSpecs(machineType, zoneName);

          // All network interfaces
          const networkInterfaces = (vm.networkInterfaces || []).map(nic => ({
            name: nic.name,
            network: nic.network?.split('/').pop(),
            subnetwork: nic.subnetwork?.split('/').pop(),
            privateIp: nic.networkIP,
            publicIp: nic.accessConfigs?.[0]?.natIP || null,
            publicDns: nic.accessConfigs?.[0]?.natIP ? `${nic.accessConfigs[0].natIP}` : null,
            aliasIpRanges: nic.aliasIpRanges || [],
            stackType: nic.stackType,
          }));

          // All attached disks
          const disks = (vm.disks || []).map(d => ({
            deviceName: d.deviceName,
            type: d.type, // PERSISTENT or SCRATCH
            mode: d.mode, // READ_WRITE or READ_ONLY
            source: d.source?.split('/').pop(),
            boot: d.boot || false,
            autoDelete: d.autoDelete,
            diskSizeGB: d.diskSizeGb,
            interface: d.interface,
            licenses: d.licenses?.map(l => l.split('/').pop()) || [],
          }));

          const bootDisk = vm.disks?.find(d => d.boot);
          const bootDiskLicenses = bootDisk?.licenses || [];
          const os = this.detectOS(bootDiskLicenses.map(l => l.split('/').pop()));

          // Service account(s)
          const serviceAccounts = (vm.serviceAccounts || []).map(sa => ({
            email: sa.email,
            scopes: sa.scopes || [],
          }));

          // Tags (network tags)
          const networkTags = vm.tags?.items || [];

          instances.push({
            id: `gcp-compute-${vm.id}`,
            rawId: String(vm.id),
            name: vm.name,
            type: 'Compute Engine VM',
            family: 'Compute',
            provider: 'gcp',
            region,
            zone: zoneName,
            status: vm.status,
            health: vm.status === 'RUNNING' ? 'healthy' : healthFromStatus(vm.status),

            // Specs
            machineType,
            vcpu: specs.vcpu || null,
            memGiB: specs.memGiB || null,
            memMB: specs.memMB || null,
            isSharedCpu: specs.isSharedCpu || false,

            // Network
            ip: vm.networkInterfaces?.[0]?.networkIP,
            publicIp: vm.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP || null,
            network: vm.networkInterfaces?.[0]?.network?.split('/').pop(),
            subnetwork: vm.networkInterfaces?.[0]?.subnetwork?.split('/').pop(),
            networkInterfaces,
            networkTags,

            // OS & Storage
            os,
            diskSizeGb: bootDisk?.diskSizeGb || null,
            bootDiskSizeGB: bootDisk?.diskSizeGb || null,
            bootDiskType: bootDisk?.type || null,
            disks,

            // Identity & Security
            serviceAccounts,
            shieldedInstanceConfig: vm.shieldedInstanceConfig || null,
            shieldedInstanceIntegrityPolicy: vm.shieldedInstanceIntegrityPolicy || null,
            confidentialInstanceConfig: vm.confidentialInstanceConfig || null,

            // Scheduling
            scheduling: vm.scheduling ? {
              onHostMaintenance: vm.scheduling.onHostMaintenance,
              automaticRestart: vm.scheduling.automaticRestart,
              preemptible: vm.scheduling.preemptible,
              provisioningModel: vm.scheduling.provisioningModel,
            } : null,
            preemptible: vm.scheduling?.preemptible || false,

            // Metadata
            launchTime: vm.creationTimestamp,
            uptime: vm.creationTimestamp ? formatUptime(vm.creationTimestamp) : null,
            lastStartTimestamp: vm.lastStartTimestamp,
            lastStopTimestamp: vm.lastStopTimestamp,
            deletionProtection: vm.deletionProtection || false,
            description: vm.description,
            fingerprint: vm.labelFingerprint,

            // Metrics (live from Cloud Monitoring not available via REST without extra API calls)
            cpu: null,
            memUsage: null,
            diskUsage: null,

            cost: estimateMonthlyCost({ machineType, family: 'Compute' }),
            tags: Object.fromEntries(Object.entries(vm.labels || {})),
            connections: [],
          });
        }
      }
      return instances;
    } catch (e) {
      console.error('GCP Compute error:', e.message);
      return [];
    }
  }

  async getGKEClusters() {
    try {
      const auth = await this.getAuth();
      const container = google.container({ version: 'v1', auth });
      const res = await container.projects.locations.clusters.list({
        parent: `projects/${this.projectId}/locations/-`,
      });
      return (res.data.clusters || []).map(c => {
        const nodePools = (c.nodePools || []).map(np => ({
          name: np.name,
          status: np.status,
          machineType: np.config?.machineType,
          diskSizeGB: np.config?.diskSizeGb,
          diskType: np.config?.diskType,
          imageType: np.config?.imageType,
          oauthScopes: np.config?.oauthScopes || [],
          serviceAccount: np.config?.serviceAccount,
          preemptible: np.config?.preemptible || false,
          spot: np.config?.spot || false,
          desiredNodeCount: np.initialNodeCount,
          autoscaling: np.autoscaling ? {
            enabled: np.autoscaling.enabled,
            minNodeCount: np.autoscaling.minNodeCount,
            maxNodeCount: np.autoscaling.maxNodeCount,
          } : null,
          management: np.management ? {
            autoUpgrade: np.management.autoUpgrade,
            autoRepair: np.management.autoRepair,
          } : null,
          version: np.version,
          locations: np.locations || [],
        }));

        return {
          id: `gcp-gke-${c.name}`,
          rawId: c.name,
          name: c.name,
          type: 'GKE Cluster',
          family: 'Container',
          provider: 'gcp',
          region: c.location,
          zone: c.zone || c.location,
          status: c.status,
          health: c.status === 'RUNNING' ? 'healthy' : healthFromStatus(c.status),
          kubernetesVersion: c.currentMasterVersion,
          nodeVersion: c.currentNodeVersion,
          nodes: c.currentNodeCount,
          nodePools,
          nodePoolCount: nodePools.length,
          pods: (c.currentNodeCount || 0) * 10,
          runningPods: (c.currentNodeCount || 0) * 9,
          endpoint: c.endpoint,
          masterIpv4CidrBlock: c.privateClusterConfig?.masterIpv4CidrBlock,
          isPrivate: c.privateClusterConfig?.enablePrivateNodes || false,
          network: c.network,
          subnetwork: c.subnetwork,
          servicesIpv4Cidr: c.servicesIpv4Cidr,
          clusterIpv4Cidr: c.clusterIpv4Cidr,
          loggingService: c.loggingService,
          monitoringService: c.monitoringService,
          networkPolicy: c.networkPolicy?.enabled || false,
          addonsConfig: c.addonsConfig ? {
            httpLoadBalancing: c.addonsConfig.httpLoadBalancing?.disabled !== true,
            horizontalPodAutoscaling: c.addonsConfig.horizontalPodAutoscaling?.disabled !== true,
            networkPolicyConfig: c.addonsConfig.networkPolicyConfig?.disabled !== true,
          } : null,
          autopilot: c.autopilot?.enabled || false,
          releaseChannel: c.releaseChannel?.channel || null,
          workloadIdentity: c.workloadIdentityConfig?.workloadPool || null,
          createdAt: c.createTime,
          launchTime: c.createTime,
          uptime: c.createTime ? formatUptime(c.createTime) : null,
          cpu: null,
          memUsage: null,
          cost: estimateMonthlyCost({ family: 'Container' }) * (c.currentNodeCount || 1),
          tags: c.resourceLabels || {},
          connections: [],
        };
      });
    } catch (e) {
      console.error('GKE error:', e.message);
      return [];
    }
  }

  async getCloudSQLDiskUsedGB(instanceName) {
    try {
      const auth = await this.getAuth();
      const monitoring = google.monitoring({ version: 'v3', auth });
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 10 * 60 * 1000);
      const res = await monitoring.projects.timeSeries.list({
        name: `projects/${this.projectId}`,
        filter: `metric.type="cloudsql.googleapis.com/database/disk/bytes_used" AND resource.labels.database_id="${this.projectId}:${instanceName}"`,
        'interval.startTime': startTime.toISOString(),
        'interval.endTime': endTime.toISOString(),
        view: 'FULL',
      });
      const series = res.data.timeSeries;
      if (!series || series.length === 0) return null;
      const points = series[0].points;
      if (!points || points.length === 0) return null;
      const latestBytes = Number(points[0].value?.int64Value || points[0].value?.doubleValue || 0);
      return latestBytes > 0 ? Math.round((latestBytes / (1024 * 1024 * 1024)) * 100) / 100 : null;
    } catch {
      return null;
    }
  }

  async getCloudSQLInstances() {
    try {
      const auth = await this.getAuth();
      const sqladmin = google.sqladmin({ version: 'v1', auth });
      const res = await sqladmin.instances.list({ project: this.projectId });
      const items = res.data.items || [];

      const instances = await Promise.all(items.map(async (db) => {
        const ipAddresses = db.ipAddresses || [];
        const usedStorageGB = await this.getCloudSQLDiskUsedGB(db.name);
        return {
          id: `gcp-sql-${db.name}`,
          rawId: db.name,
          name: db.name,
          type: 'Cloud SQL Instance',
          family: 'Database',
          provider: 'gcp',
          region: db.region,
          zone: db.gceZone,
          secondaryZone: db.failoverReplica?.name ? db.gceZone : null,
          status: db.state,
          health: db.state === 'RUNNABLE' ? 'healthy' : healthFromStatus(db.state),

          // Engine
          engine: db.databaseVersion,
          databaseVersion: db.databaseVersion,
          backendType: db.backendType,

          // Specs
          tier: db.settings?.tier,
          vcpu: null,
          memGiB: null,
          dataDiskSizeGb: db.settings?.dataDiskSizeGb,
          dataDiskType: db.settings?.dataDiskType,
          storageAutoResize: db.settings?.storageAutoResize,
          storageAutoResizeLimit: db.settings?.storageAutoResizeLimitGb,
          usedStorageGB,

          // Network
          ip: ipAddresses.find(a => a.type === 'PRIVATE')?.ipAddress || null,
          publicIp: ipAddresses.find(a => a.type === 'PRIMARY')?.ipAddress || null,
          outgoingIp: ipAddresses.find(a => a.type === 'OUTGOING')?.ipAddress || null,
          ipAddresses: ipAddresses.map(a => ({ type: a.type, ip: a.ipAddress })),
          connectionName: db.connectionName,
          requireSsl: db.settings?.ipConfiguration?.requireSsl || false,
          privateNetwork: db.settings?.ipConfiguration?.privateNetwork?.split('/').pop() || null,

          // HA & Backup
          multiAZ: db.settings?.availabilityType === 'REGIONAL',
          availabilityType: db.settings?.availabilityType,
          backupEnabled: db.settings?.backupConfiguration?.enabled,
          pointInTimeRecovery: db.settings?.backupConfiguration?.pointInTimeRecoveryEnabled || false,
          backupLocation: db.settings?.backupConfiguration?.location,
          transactionLogRetentionDays: db.settings?.backupConfiguration?.transactionLogRetentionDays,
          maintenanceWindow: db.settings?.maintenanceWindow ? {
            day: db.settings.maintenanceWindow.day,
            hour: db.settings.maintenanceWindow.hour,
          } : null,

          // Flags & config
          databaseFlags: (db.settings?.databaseFlags || []).map(f => ({ name: f.name, value: f.value })),
          activationPolicy: db.settings?.activationPolicy,

          // Replicas
          replicaNames: db.replicaNames || [],
          masterInstanceName: db.masterInstanceName || null,
          isReplica: !!db.masterInstanceName,
          replicaConfiguration: db.replicaConfiguration ? {
            failoverTarget: db.replicaConfiguration.failoverTarget,
          } : null,

          launchTime: db.createTime,
          uptime: db.createTime ? formatUptime(db.createTime) : null,
          cpu: null,
          maxConnections: null,
          cost: estimateMonthlyCost({ family: 'Database' }),
          tags: db.settings?.userLabels || {},
          connections: [],
        };
      }));
      return instances;
    } catch (e) {
      console.error('Cloud SQL error:', e.message);
      return [];
    }
  }

  async getCloudStorageBuckets() {
    try {
      const auth = await this.getAuth();
      const storage = google.storage({ version: 'v1', auth });
      const res = await storage.buckets.list({
        project: this.projectId,
        projection: 'full',
      });
      return (res.data.items || []).map(b => ({
        id: `gcp-gcs-${b.name}`,
        rawId: b.name,
        name: b.name,
        type: 'Cloud Storage Bucket',
        family: 'Storage',
        provider: 'gcp',
        region: b.location?.toLowerCase(),
        locationType: b.locationType, // region, dual-region, multi-region
        status: 'Active',
        health: 'healthy',
        storageClass: b.storageClass,
        defaultStorageClass: b.defaultObjectAcl?.[0]?.role || null,
        sizeGB: 0,
        objects: 0,
        versioning: b.versioning?.enabled || false,
        uniformBucketLevelAccess: b.iamConfiguration?.uniformBucketLevelAccess?.enabled || false,
        publicAccessPrevention: b.iamConfiguration?.publicAccessPrevention || 'inherited',
        encryption: b.encryption?.defaultKmsKeyName ? 'CMEK' : 'Google-managed',
        kmsKey: b.encryption?.defaultKmsKeyName?.split('/').pop() || null,
        retentionPolicy: b.retentionPolicy ? {
          retentionPeriodSec: b.retentionPolicy.retentionPeriod,
          isLocked: b.retentionPolicy.isLocked,
          effectiveTime: b.retentionPolicy.effectiveTime,
        } : null,
        lifecycleRules: (b.lifecycle?.rule || []).length,
        cors: (b.cors || []).length > 0,
        logging: !!b.logging?.logBucket,
        website: !!b.website,
        createdAt: b.timeCreated,
        launchTime: b.timeCreated,
        cost: 2 + Math.random() * 20,
        tags: b.labels || {},
        connections: [],
      }));
    } catch (e) {
      console.error('GCS error:', e.message);
      return [];
    }
  }

  async getCloudFunctions() {
    try {
      const auth = await this.getAuth();
      const cloudfunctions = google.cloudfunctions({ version: 'v1', auth });
      const res = await cloudfunctions.projects.locations.functions.list({
        parent: `projects/${this.projectId}/locations/-`,
      });
      return (res.data.functions || []).map(fn => {
        const locationParts = fn.name.split('/');
        const region = locationParts[3];
        return {
          id: `gcp-function-${fn.name.split('/').pop()}`,
          rawId: fn.name,
          name: fn.name.split('/').pop(),
          type: 'Cloud Function',
          family: 'Serverless',
          provider: 'gcp',
          region,
          status: fn.status,
          health: fn.status === 'ACTIVE' ? 'healthy' : healthFromStatus(fn.status),

          // Runtime
          runtime: fn.runtime,
          entryPoint: fn.entryPoint,
          memorySizeMB: fn.availableMemoryMb || 256,
          memorySize: `${fn.availableMemoryMb || 256} MB`,
          timeout: fn.timeout?.replace('s', '') || '60',
          maxInstances: fn.maxInstances || null,
          minInstances: fn.minInstances || null,

          // Trigger
          httpsTrigger: fn.httpsTrigger ? { url: fn.httpsTrigger.url, securityLevel: fn.httpsTrigger.securityLevel } : null,
          eventTrigger: fn.eventTrigger ? {
            eventType: fn.eventTrigger.eventType,
            resource: fn.eventTrigger.resource,
          } : null,

          // Network
          vpc: fn.vpcConnector?.split('/').pop() || null,
          vpcConnectorEgressSettings: fn.vpcConnectorEgressSettings,
          ingressSettings: fn.ingressSettings,

          // Security
          serviceAccountEmail: fn.serviceAccountEmail,
          secretEnvVars: (fn.secretEnvironmentVariables || []).map(s => s.key),
          envVarKeys: Object.keys(fn.environmentVariables || {}),

          // Source
          sourceRepository: fn.sourceRepository?.url || null,

          launchTime: fn.updateTime,
          uptime: fn.updateTime ? formatUptime(fn.updateTime) : null,
          invocations: null,
          errors: null,
          duration: null,
          cost: 0.3 + Math.random() * 2,
          tags: fn.labels || {},
          connections: [],
        };
      });
    } catch (e) {
      console.error('Cloud Functions error:', e.message);
      return [];
    }
  }

  async getPubSubTopics() {
    try {
      const auth = await this.getAuth();
      const pubsub = google.pubsub({ version: 'v1', auth });
      const res = await pubsub.projects.topics.list({
        project: `projects/${this.projectId}`,
      });
      const topics = (res.data.topics || []).slice(0, 20);
      const results = [];
      for (const t of topics) {
        const name = t.name.split('/').pop();
        let subscriptionCount = 0;
        try {
          const subs = await pubsub.projects.topics.subscriptions.list({ topic: t.name });
          subscriptionCount = subs.data.subscriptions?.length || 0;
        } catch {}
        results.push({
          id: `gcp-pubsub-${name}`,
          rawId: t.name,
          name,
          type: 'Pub/Sub Topic',
          family: 'Messaging',
          provider: 'gcp',
          region: 'global',
          status: 'Active',
          health: 'healthy',
          kmsKeyName: t.kmsKeyName?.split('/').pop() || null,
          messageRetentionDuration: t.messageRetentionDuration || null,
          schemaSettings: t.schemaSettings ? {
            schema: t.schemaSettings.schema?.split('/').pop(),
            encoding: t.schemaSettings.encoding,
          } : null,
          subscriptionCount,
          messages: null,
          cost: 0.5 + Math.random() * 3,
          tags: t.labels || {},
          connections: [],
        });
      }
      return results;
    } catch (e) {
      console.error('Pub/Sub error:', e.message);
      return [];
    }
  }

  async getBigQueryDatasets() {
    try {
      const auth = await this.getAuth();
      const bigquery = google.bigquery({ version: 'v2', auth });
      const res = await bigquery.datasets.list({ projectId: this.projectId });
      const datasets = [];
      for (const ds of (res.data.datasets || []).slice(0, 15)) {
        const dsId = ds.datasetReference.datasetId;
        const detail = await bigquery.datasets.get({
          projectId: this.projectId,
          datasetId: dsId,
        }).catch(() => ({ data: {} }));

        // Count tables
        let tableCount = 0;
        try {
          const tables = await bigquery.tables.list({ projectId: this.projectId, datasetId: dsId });
          tableCount = tables.data.totalItems || (tables.data.tables || []).length;
        } catch {}

        datasets.push({
          id: `gcp-bigquery-${dsId}`,
          rawId: dsId,
          name: dsId,
          type: 'BigQuery Dataset',
          family: 'Analytics',
          provider: 'gcp',
          region: (ds.location || 'us').toLowerCase(),
          status: 'Active',
          health: 'healthy',
          location: ds.location,
          description: detail.data.description,
          tableCount,
          defaultTableExpirationMs: detail.data.defaultTableExpirationMs || null,
          defaultPartitionExpirationMs: detail.data.defaultPartitionExpirationMs || null,
          access: (detail.data.access || []).length,
          encryptionConfig: detail.data.defaultEncryptionConfiguration?.kmsKeyName ? 'CMEK' : 'Google-managed',
          createdAt: detail.data.creationTime ? new Date(parseInt(detail.data.creationTime)).toISOString() : null,
          lastModified: detail.data.lastModifiedTime ? new Date(parseInt(detail.data.lastModifiedTime)).toISOString() : null,
          cost: 5 + Math.random() * 50,
          tags: ds.friendlyName ? { name: ds.friendlyName } : {},
          connections: [],
        });
      }
      return datasets;
    } catch (e) {
      console.error('BigQuery error:', e.message);
      return [];
    }
  }

  async getVPCNetworks() {
    try {
      const auth = await this.getAuth();
      const compute = google.compute({ version: 'v1', auth });
      const [networksRes, firewallsRes, routersRes] = await Promise.all([
        compute.networks.list({ project: this.projectId }),
        compute.firewalls.list({ project: this.projectId }).catch(() => ({ data: { items: [] } })),
        compute.routers.aggregatedList({ project: this.projectId }).catch(() => ({ data: { items: {} } })),
      ]);

      const firewallsByNetwork = {};
      for (const fw of (firewallsRes.data.items || [])) {
        const net = fw.network?.split('/').pop();
        if (!firewallsByNetwork[net]) firewallsByNetwork[net] = [];
        firewallsByNetwork[net].push({
          name: fw.name,
          direction: fw.direction,
          priority: fw.priority,
          disabled: fw.disabled || false,
          targetTags: fw.targetTags || [],
          sourceRanges: fw.sourceRanges || [],
          allowed: (fw.allowed || []).map(a => ({ protocol: a.IPProtocol, ports: a.ports || [] })),
          denied: (fw.denied || []).map(d => ({ protocol: d.IPProtocol, ports: d.ports || [] })),
        });
      }

      return (networksRes.data.items || []).map(n => ({
        id: `gcp-vpc-${n.name}`,
        rawId: n.name,
        name: n.name,
        type: 'VPC Network',
        family: 'Networking',
        provider: 'gcp',
        region: 'global',
        status: 'Active',
        health: 'healthy',
        autoCreateSubnets: n.autoCreateSubnetworks,
        routingMode: n.routingConfig?.routingMode || 'REGIONAL',
        mtu: n.mtu || 1460,
        subnetworks: (n.subnetworks || []).map(s => s.split('/').pop()),
        subnetworkCount: (n.subnetworks || []).length,
        firewalls: firewallsByNetwork[n.name] || [],
        firewallCount: (firewallsByNetwork[n.name] || []).length,
        gatewayIpv4: n.gatewayIPv4,
        ipv4Range: n.IPv4Range || null,
        cost: 0,
        tags: {},
        connections: [],
      }));
    } catch (e) {
      return [];
    }
  }

  async getAlerts() {
    try {
      const auth = await this.getAuth();
      const monitoring = google.monitoring({ version: 'v3', auth });
      const res = await monitoring.projects.alertPolicies.list({
        name: `projects/${this.projectId}`,
      });
      const alerts = [];
      for (const policy of (res.data.alertPolicies || [])) {
        if (!policy.enabled?.value) continue;
        if (policy.conditions?.length) {
          alerts.push({
            id: `gcp-alert-${policy.name?.split('/').pop()}`,
            title: policy.displayName || 'GCP Alert Policy',
            message: policy.conditions?.[0]?.displayName || 'Condition triggered',
            severity: 'warning',
            provider: 'gcp',
            service: policy.conditions?.[0]?.conditionThreshold?.filter?.[0]?.value || 'Unknown',
            region: 'global',
            time: new Date().toISOString(),
            acknowledged: false,
          });
        }
      }
      return alerts;
    } catch (e) {
      console.error('GCP Monitoring error:', e.message);
      return [];
    }
  }

  async getAllResources() {
    const results = await Promise.allSettled([
      this.getComputeInstances(),
      this.getGKEClusters(),
      this.getCloudSQLInstances(),
      this.getCloudStorageBuckets(),
      this.getCloudFunctions(),
      this.getPubSubTopics(),
      this.getBigQueryDatasets(),
      this.getVPCNetworks(),
    ]);

    let allResources = [];
    for (const r of results) {
      if (r.status === 'fulfilled') allResources = allResources.concat(r.value);
    }
    buildGCPConnectionGraph(allResources);
    return allResources;
  }
}

function buildGCPConnectionGraph(resources) {
  const byNetwork = {};
  for (const r of resources) {
    if (r.network) {
      if (!byNetwork[r.network]) byNetwork[r.network] = [];
      byNetwork[r.network].push(r.id);
    }
  }
  for (const r of resources) {
    const conns = new Set();
    if (r.network && byNetwork[r.network]) {
      byNetwork[r.network].filter(id => id !== r.id).slice(0, 6).forEach(id => conns.add(id));
    }
    if (r.family === 'Serverless') {
      resources.filter(x => ['Database', 'Storage'].includes(x.family)).slice(0, 3).forEach(x => conns.add(x.id));
    }
    r.connections = Array.from(conns).slice(0, 8);
  }
}

function formatUptime(since) {
  const ms = Date.now() - new Date(since).getTime();
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  if (d > 0) return `${d}d ${h}h`;
  return `${h}h`;
}

// azureService
// services/azureService.js
const { DefaultAzureCredential, ClientSecretCredential,
  ManagedIdentityCredential } = require('@azure/identity');
const { ComputeManagementClient } = require('@azure/arm-compute');
const { NetworkManagementClient } = require('@azure/arm-network');
const { StorageManagementClient } = require('@azure/arm-storage');
const { SqlManagementClient } = require('@azure/arm-sql');
const { ContainerServiceClient } = require('@azure/arm-containerservice');
const { CosmosDBManagementClient } = require('@azure/arm-cosmosdb');
const { EventHubManagementClient } = require('@azure/arm-eventhub');
const { WebSiteManagementClient } = require('@azure/arm-appservice');
const { MonitorClient } = require('@azure/arm-monitor');

// Azure VM size specs lookup
const AZURE_VM_SPECS = {
  'Standard_B1s': { vcpu: 1, memGiB: 1 }, 'Standard_B1ms': { vcpu: 1, memGiB: 2 },
  'Standard_B2s': { vcpu: 2, memGiB: 4 }, 'Standard_B2ms': { vcpu: 2, memGiB: 8 },
  'Standard_B4ms': { vcpu: 4, memGiB: 16 }, 'Standard_B8ms': { vcpu: 8, memGiB: 32 },
  'Standard_D2s_v3': { vcpu: 2, memGiB: 8 }, 'Standard_D4s_v3': { vcpu: 4, memGiB: 16 },
  'Standard_D8s_v3': { vcpu: 8, memGiB: 32 }, 'Standard_D16s_v3': { vcpu: 16, memGiB: 64 },
  'Standard_D2s_v4': { vcpu: 2, memGiB: 8 }, 'Standard_D4s_v4': { vcpu: 4, memGiB: 16 },
  'Standard_D2s_v5': { vcpu: 2, memGiB: 8 }, 'Standard_D4s_v5': { vcpu: 4, memGiB: 16 },
  'Standard_D8s_v5': { vcpu: 8, memGiB: 32 }, 'Standard_D16s_v5': { vcpu: 16, memGiB: 64 },
  'Standard_E2s_v3': { vcpu: 2, memGiB: 16 }, 'Standard_E4s_v3': { vcpu: 4, memGiB: 32 },
  'Standard_E8s_v3': { vcpu: 8, memGiB: 64 }, 'Standard_E16s_v3': { vcpu: 16, memGiB: 128 },
  'Standard_F2s_v2': { vcpu: 2, memGiB: 4 }, 'Standard_F4s_v2': { vcpu: 4, memGiB: 8 },
  'Standard_F8s_v2': { vcpu: 8, memGiB: 16 }, 'Standard_F16s_v2': { vcpu: 16, memGiB: 32 },
  'Standard_A1_v2': { vcpu: 1, memGiB: 2 }, 'Standard_A2_v2': { vcpu: 2, memGiB: 4 },
  'Standard_NC6': { vcpu: 6, memGiB: 56 }, 'Standard_NC12': { vcpu: 12, memGiB: 112 },
};

class AzureService {
  constructor(credentials) {
    this.creds = credentials;
    this.subscriptionId = credentials.subscriptionId;
    this.credential = null;
    this._nicCache = {};
    this._vmSizeCache = {};
  }

  getCredential() {
    if (this.credential) return this.credential;
    const { authType, tenantId, clientId, clientSecret } = this.creds;
    if (authType === 'servicePrincipal' && tenantId && clientId && clientSecret) {
      this.credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    } else if (authType === 'managedIdentity') {
      this.credential = new ManagedIdentityCredential(clientId);
    } else {
      this.credential = new DefaultAzureCredential();
    }
    return this.credential;
  }

  async verifyConnection() {
    try {
      const cred = this.getCredential();
      const compute = new ComputeManagementClient(cred, this.subscriptionId);
      const iter = compute.virtualMachines.listAll();
      await iter.next();
      return { success: true, subscriptionId: this.subscriptionId };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // Lookup VM size specs (vCPU, memory)
  async getVMSizeSpecs(size, location) {
    if (!size) return {};
    if (AZURE_VM_SPECS[size]) return AZURE_VM_SPECS[size];
    const cacheKey = `${location}:${size}`;
    if (this._vmSizeCache[cacheKey]) return this._vmSizeCache[cacheKey];
    try {
      const cred = this.getCredential();
      const compute = new ComputeManagementClient(cred, this.subscriptionId);
      for await (const vmSize of compute.virtualMachineSizes.list(location)) {
        if (vmSize.name === size) {
          const specs = {
            vcpu: vmSize.numberOfCores,
            memGiB: vmSize.memoryInMB ? Math.round(vmSize.memoryInMB / 1024 * 10) / 10 : null,
            memMB: vmSize.memoryInMB,
            maxDataDiskCount: vmSize.maxDataDiskCount,
            osDiskSizeGB: vmSize.osDiskSizeInMB ? Math.round(vmSize.osDiskSizeInMB / 1024) : null,
            resourceDiskSizeGB: vmSize.resourceDiskSizeInMB ? Math.round(vmSize.resourceDiskSizeInMB / 1024) : null,
          };
          this._vmSizeCache[cacheKey] = specs;
          return specs;
        }
      }
    } catch {}
    this._vmSizeCache[cacheKey] = {};
    return {};
  }

  // Fetch NIC details including private/public IP
  async getNICDetails(nicId, networkClient) {
    if (!nicId) return null;
    if (this._nicCache[nicId]) return this._nicCache[nicId];
    try {
      const parts = nicId.split('/');
      const rg = parts[4];
      const nicName = parts[parts.length - 1];
      const nic = await networkClient.networkInterfaces.get(rg, nicName);

      const details = {
        id: nic.id,
        name: nic.name,
        macAddress: nic.macAddress,
        enableAcceleratedNetworking: nic.enableAcceleratedNetworking,
        enableIpForwarding: nic.enableIpForwarding,
        location: nic.location,
        dnsSettings: nic.dnsSettings,
        networkSecurityGroupId: nic.networkSecurityGroup?.id?.split('/').pop() || null,
        ipConfigurations: await Promise.all((nic.ipConfigurations || []).map(async ipConfig => {
          let publicIp = null;
          let publicIpDns = null;
          let publicIpSku = null;
          let publicIpAllocation = null;

          // Fetch public IP details if associated
          if (ipConfig.publicIPAddress?.id) {
            try {
              const pipParts = ipConfig.publicIPAddress.id.split('/');
              const pipRg = pipParts[4];
              const pipName = pipParts[pipParts.length - 1];
              const pip = await networkClient.publicIPAddresses.get(pipRg, pipName);
              publicIp = pip.ipAddress || null;
              publicIpDns = pip.dnsSettings?.fqdn || null;
              publicIpSku = pip.sku?.name || null;
              publicIpAllocation = pip.publicIPAllocationMethod || null;
            } catch {}
          }

          return {
            name: ipConfig.name,
            privateIp: ipConfig.privateIPAddress,
            privateIpAllocation: ipConfig.privateIPAllocationMethod,
            publicIp,
            publicIpDns,
            publicIpSku,
            publicIpAllocation,
            subnetId: ipConfig.subnet?.id?.split('/').pop() || null,
            subnetRef: ipConfig.subnet?.id || null,
            primary: ipConfig.primary || false,
          };
        })),
      };
      this._nicCache[nicId] = details;
      return details;
    } catch { return null; }
  }

  async getVirtualMachines() {
    try {
      const cred = this.getCredential();
      const compute = new ComputeManagementClient(cred, this.subscriptionId);
      const networkClient = new NetworkManagementClient(cred, this.subscriptionId);
      const vms = [];

      for await (const vm of compute.virtualMachines.listAll()) {
        const location = vm.location;
        const rg = vm.id?.split('/')[4] || 'unknown';
        const tags = vm.tags || {};
        const osType = vm.storageProfile?.osDisk?.osType || 'Linux';

        // Power state from instance view
        let powerState = 'unknown';
        let provisioningState = vm.provisioningState;
        let computerName = null;
        let osProfile = {};
        try {
          const view = await compute.virtualMachines.instanceView(rg, vm.name || '');
          const ps = (view.statuses || []).find(s => s.code?.startsWith('PowerState/'));
          powerState = ps?.code?.replace('PowerState/', '') || 'unknown';
          computerName = view.computerName || null;
          osProfile = {
            osName: view.osName,
            osVersion: view.osVersion,
            computerName,
          };
        } catch {}

        // VM size specs
        const vmSize = vm.hardwareProfile?.vmSize;
        const specs = await this.getVMSizeSpecs(vmSize, location);

        // NIC details (fetch all NICs to get IPs)
        const nicRefs = vm.networkProfile?.networkInterfaces || [];
        const nicDetails = await Promise.all(
          nicRefs.map(nic => this.getNICDetails(nic.id, networkClient))
        );
        const validNics = nicDetails.filter(Boolean);

        // Flatten primary/secondary IPs
        const primaryNic = validNics.find(n => n.ipConfigurations?.some(ip => ip.primary)) || validNics[0];
        const primaryIpConfig = primaryNic?.ipConfigurations?.find(ip => ip.primary) || primaryNic?.ipConfigurations?.[0];

        // OS disk details
        const osDisk = vm.storageProfile?.osDisk;
        // Data disks
        const dataDisks = (vm.storageProfile?.dataDisks || []).map(d => ({
          lun: d.lun,
          name: d.name,
          diskSizeGB: d.diskSizeGB,
          caching: d.caching,
          createOption: d.createOption,
          managed: !!d.managedDisk,
          managedDiskId: d.managedDisk?.id?.split('/').pop() || null,
          storageAccountType: d.managedDisk?.storageAccountType || null,
        }));

        // Image reference
        const imageRef = vm.storageProfile?.imageReference;

        // Extensions
        let extensions = [];
        try {
          for await (const ext of compute.virtualMachineExtensions.list(rg, vm.name || '')) {
            extensions.push({
              name: ext.name,
              publisher: ext.publisher,
              type: ext.typePropertiesType || ext.type,
              version: ext.typeHandlerVersion,
              provisioningState: ext.provisioningState,
            });
          }
        } catch {}

        vms.push({
          id: `az-vm-${vm.id?.split('/').pop() || vm.name}`,
          rawId: vm.id,
          name: vm.name || 'unnamed-vm',
          type: 'Virtual Machine',
          family: 'Compute',
          provider: 'azure',
          region: location,
          resourceGroup: rg,
          status: powerState,
          provisioningState,
          health: ['running'].includes(powerState) ? 'healthy' :
            powerState === 'deallocated' ? 'stopped' : healthFromStatus(powerState),

          // Specs
          size: vmSize,
          vcpu: specs.vcpu || null,
          memGiB: specs.memGiB || null,
          memMB: specs.memMB || null,
          maxDataDiskCount: specs.maxDataDiskCount || null,

          // OS
          os: osType,
          osProfile,
          imagePublisher: imageRef?.publisher,
          imageOffer: imageRef?.offer,
          imageSku: imageRef?.sku,
          imageVersion: imageRef?.exactVersion || imageRef?.version,
          imageId: imageRef?.id?.split('/').pop() || null,

          // Storage
          osDiskSizeGB: osDisk?.diskSizeGB || specs?.osDiskSizeGB || null,
          osDisk: osDisk ? {
            name: osDisk.name,
            osType: osDisk.osType,
            caching: osDisk.caching,
            createOption: osDisk.createOption,
            diskSizeGB: osDisk.diskSizeGB,
            managed: !!osDisk.managedDisk,
            managedDiskId: osDisk.managedDisk?.id?.split('/').pop() || null,
            storageAccountType: osDisk.managedDisk?.storageAccountType || null,
            writeAcceleratorEnabled: osDisk.writeAcceleratorEnabled || false,
            encryptionType: osDisk.managedDisk?.diskEncryptionSet?.id ? 'CMEK' : 'platform',
          } : null,
          dataDisks,
          dataDiskCount: dataDisks.length,

          // Network
          ip: primaryIpConfig?.privateIp || null,
          publicIp: primaryIpConfig?.publicIp || null,
          publicDns: primaryIpConfig?.publicIpDns || null,
          networkInterfaces: validNics.map(nic => ({
            name: nic.name,
            macAddress: nic.macAddress,
            acceleratedNetworking: nic.enableAcceleratedNetworking,
            ipForwarding: nic.enableIpForwarding,
            nsgId: nic.networkSecurityGroupId,
            ipConfigurations: nic.ipConfigurations || [],
          })),

          // Security
          extensions,
          availabilitySet: vm.availabilitySet?.id?.split('/').pop() || null,
          availabilityZones: vm.zones || [],
          proximityPlacementGroup: vm.proximityPlacementGroup?.id?.split('/').pop() || null,
          licenseType: vm.licenseType || null,
          priority: vm.priority || 'Regular',
          evictionPolicy: vm.evictionPolicy || null,
          billingProfile: vm.billingProfile?.maxPrice ?? null,

          // Diagnostics
          bootDiagnostics: vm.diagnosticsProfile?.bootDiagnostics?.enabled || false,

          launchTime: null, // Not directly available on VM resource; comes from Activity Log
          uptime: null,
          cpu: null,
          memUsage: null,
          diskUsage: null,
          cost: estimateMonthlyCost({ instanceType: vmSize, family: 'Compute' }),
          tags,
          connections: [],
        });
      }
      return vms;
    } catch (e) {
      console.error('Azure VM error:', e.message);
      return [];
    }
  }

  async getAKSClusters() {
    try {
      const cred = this.getCredential();
      const containerService = new ContainerServiceClient(cred, this.subscriptionId);
      const networkClient = new NetworkManagementClient(cred, this.subscriptionId);
      const clusters = [];

      for await (const cluster of containerService.managedClusters.list()) {
        const rg = cluster.id?.split('/')[4] || 'unknown';
        const agentPools = cluster.agentPoolProfiles || [];
        const nodeCount = agentPools.reduce((a, p) => a + (p.count || 0), 0);

        const nodePools = agentPools.map(p => ({
          name: p.name,
          count: p.count,
          vmSize: p.vmSize,
          osDiskSizeGB: p.osDiskSizeGB,
          osDiskType: p.osDiskType,
          osType: p.osType,
          osSKU: p.osSKU,
          mode: p.mode,  // System or User
          type: p.type,  // VirtualMachineScaleSets or AvailabilitySet
          availabilityZones: p.availabilityZones || [],
          enableAutoScaling: p.enableAutoScaling || false,
          minCount: p.minCount,
          maxCount: p.maxCount,
          maxPods: p.maxPods,
          nodeLabels: p.nodeLabels || {},
          nodeTaints: p.nodeTaints || [],
          upgradeSettings: p.upgradeSettings,
          provisioningState: p.provisioningState,
          powerState: p.powerState?.code || 'Running',
          kubeletDiskType: p.kubeletDiskType,
          vnetSubnetId: p.vnetSubnetId?.split('/').pop() || null,
        }));

        // Fetch VNET info if available
        let vnetName = null;
        if (agentPools[0]?.vnetSubnetId) {
          const parts = agentPools[0].vnetSubnetId.split('/');
          vnetName = parts[parts.indexOf('virtualNetworks') + 1] || null;
        }

        clusters.push({
          id: `az-aks-${cluster.name}`,
          rawId: cluster.id,
          name: cluster.name || 'unnamed-aks',
          type: 'AKS Cluster',
          family: 'Container',
          provider: 'azure',
          region: cluster.location,
          resourceGroup: rg,
          status: cluster.provisioningState,
          health: cluster.provisioningState === 'Succeeded' ? 'healthy' : healthFromStatus(cluster.provisioningState),

          // Kubernetes
          kubernetesVersion: cluster.kubernetesVersion,
          currentKubernetesVersion: cluster.currentKubernetesVersion,
          nodes: nodeCount,
          nodeGroups: agentPools.length,
          nodePools,

          // Workloads (estimated)
          pods: nodeCount * 12,
          runningPods: nodeCount * 11,

          // Network
          fqdn: cluster.fqdn,
          privateFqdn: cluster.privateFQDN,
          dnsPrefix: cluster.dnsPrefix,
          vnet: vnetName,
          networkPlugin: cluster.networkProfile?.networkPlugin,
          networkPolicy: cluster.networkProfile?.networkPolicy,
          podCidr: cluster.networkProfile?.podCidr,
          serviceCidr: cluster.networkProfile?.serviceCidr,
          dnsServiceIp: cluster.networkProfile?.dnsServiceIP,
          loadBalancerSku: cluster.networkProfile?.loadBalancerSku,

          // Identity & security
          identityType: cluster.identity?.type,
          clientId: cluster.servicePrincipalProfile?.clientId,
          enableRBAC: cluster.enableRBAC || false,
          enablePrivateCluster: cluster.apiServerAccessProfile?.enablePrivateCluster || false,
          authorizedIpRanges: cluster.apiServerAccessProfile?.authorizedIPRanges || [],
          addonProfiles: cluster.addonProfiles ? Object.entries(cluster.addonProfiles).map(([k, v]) => ({
            name: k,
            enabled: v.enabled,
          })) : [],

          // OS & node config
          nodeResourceGroup: cluster.nodeResourceGroup,
          autoUpgradeChannel: cluster.autoUpgradeProfile?.upgradeChannel || 'none',

          launchTime: null,
          uptime: null,
          cpu: null,
          memUsage: null,
          cost: estimateMonthlyCost({ family: 'Container' }) * (nodeCount || 1),
          tags: cluster.tags || {},
          connections: [],
        });
      }
      return clusters;
    } catch (e) {
      console.error('AKS error:', e.message);
      return [];
    }
  }

  async getSQLCurrentSizeBytes(cred, resourceId) {
    try {
      const monitorClient = new MonitorClient(cred, this.subscriptionId);
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 10 * 60 * 1000);
      const result = await monitorClient.metrics.list(resourceId, {
        metricnames: 'storage',
        timespan: `${startTime.toISOString()}/${endTime.toISOString()}`,
        interval: 'PT1M',
        aggregation: 'Average',
      });
      const series = result?.value?.[0]?.timeseries;
      if (!series || series.length === 0) return null;
      const dataPoints = series[0].data || [];
      const latest = dataPoints.filter(d => d.average != null).pop();
      return latest?.average != null ? Math.round(latest.average) : null;
    } catch {
      return null;
    }
  }

  async getSQLDatabases() {
    try {
      const cred = this.getCredential();
      const sqlClient = new SqlManagementClient(cred, this.subscriptionId);
      const dbs = [];

      for await (const server of sqlClient.servers.list()) {
        const rg = server.id?.split('/')[4] || 'unknown';

        for await (const db of sqlClient.databases.listByServer(rg, server.name || '')) {
          if (db.name === 'master') continue;

          dbs.push({
            id: `az-sqldb-${db.name}-${server.name}`,
            rawId: db.id,
            name: db.name || 'unnamed-db',
            type: 'Azure SQL Database',
            family: 'Database',
            provider: 'azure',
            region: db.location,
            resourceGroup: rg,
            server: server.name,
            serverFqdn: server.fullyQualifiedDomainName,
            status: db.status,
            health: db.status === 'Online' ? 'healthy' : healthFromStatus(db.status),

            // Specs
            tier: db.sku?.tier,
            size: db.sku?.name,
            skuCapacity: db.sku?.capacity,
            storageGB: Math.round((db.maxSizeBytes || 0) / 1073741824),
            maxSizeBytes: db.maxSizeBytes,
            currentSizeBytes: null, // populated below via Azure Monitor

            // Edition / service objective
            edition: db.edition,
            serviceObjective: db.currentServiceObjectiveName,
            elasticPoolId: db.elasticPoolId?.split('/').pop() || null,

            // Server details
            serverVersion: server.version,
            serverAdminLogin: server.administratorLogin,
            serverPublicNetworkAccess: server.publicNetworkAccess,
            serverMinTlsVersion: server.minimalTlsVersion,
            serverConnectionPolicy: null,

            // Network
            ip: null,
            endpoint: server.fullyQualifiedDomainName ? `${server.fullyQualifiedDomainName}:1433` : null,

            // HA & Backup
            zoneRedundant: db.zoneRedundant || false,
            geoReplication: db.secondaryType != null,
            secondaryType: db.secondaryType,
            requestedBackupStorageRedundancy: db.requestedBackupStorageRedundancy,
            earliestRestoreDate: db.earliestRestoreDate,

            // Licensing
            licenseType: db.licenseType,
            readReplicaCount: db.highAvailabilityReplicaCount || 0,
            readScale: db.readScale,
            collation: db.collation,

            // Encryption
            transparentDataEncryption: true,

            launchTime: db.creationDate,
            uptime: db.creationDate ? formatUptime(db.creationDate) : null,
            cpu: null,
            dbConnections: null,
            cost: estimateMonthlyCost({ family: 'Database' }),
            tags: db.tags || {},
            connections: [],
          });
        }
      }

      // Fetch real-time storage usage from Azure Monitor in parallel
      await Promise.all(dbs.map(async (db) => {
        if (db.rawId) {
          db.currentSizeBytes = await this.getSQLCurrentSizeBytes(cred, db.rawId);
        }
      }));

      return dbs;
    } catch (e) {
      console.error('Azure SQL error:', e.message);
      return [];
    }
  }

  async getStorageAccounts() {
    try {
      const cred = this.getCredential();
      const storageClient = new StorageManagementClient(cred, this.subscriptionId);
      const accounts = [];

      for await (const account of storageClient.storageAccounts.list()) {
        const rg = account.id?.split('/')[4] || 'unknown';

        accounts.push({
          id: `az-storage-${account.name}`,
          rawId: account.id,
          name: account.name || 'unnamed-storage',
          type: 'Storage Account',
          family: 'Storage',
          provider: 'azure',
          region: account.location,
          resourceGroup: rg,
          status: account.provisioningState,
          health: account.provisioningState === 'Succeeded' ? 'healthy' : healthFromStatus(account.provisioningState),

          // Tier & type
          tier: account.sku?.tier,
          skuName: account.sku?.name,
          kind: account.kind,
          accessTier: account.accessTier,

          // Endpoints
          blobEndpoint: account.primaryEndpoints?.blob || null,
          fileEndpoint: account.primaryEndpoints?.file || null,
          queueEndpoint: account.primaryEndpoints?.queue || null,
          tableEndpoint: account.primaryEndpoints?.table || null,
          dfsEndpoint: account.primaryEndpoints?.dfs || null,
          primaryLocation: account.primaryLocation,
          secondaryLocation: account.secondaryLocation,
          statusOfPrimary: account.statusOfPrimary,
          statusOfSecondary: account.statusOfSecondary,

          // Security & encryption
          encryption: account.encryption?.services?.blob?.enabled ? 'Enabled' : 'Disabled',
          encryptionKeyType: account.encryption?.keySource || 'Microsoft.Storage',
          keyVaultUri: account.encryption?.keyVaultProperties?.keyVaultUri || null,
          httpsOnly: account.enableHttpsTrafficOnly,
          minTlsVersion: account.minimumTlsVersion,
          allowBlobPublicAccess: account.allowBlobPublicAccess,
          allowSharedKeyAccess: account.allowSharedKeyAccess,

          // Network rules
          networkDefaultAction: account.networkRuleSet?.defaultAction || 'Allow',
          networkBypassServices: account.networkRuleSet?.bypass || [],
          ipRules: (account.networkRuleSet?.ipRules || []).map(r => r.iPAddressOrRange),
          virtualNetworkRules: (account.networkRuleSet?.virtualNetworkRules || []).length,

          // Replication & DR
          replicationKind: account.sku?.name, // LRS, GRS, RAGRS, ZRS, GZRS, RAGZRS
          largeFileSharesState: account.largeFileSharesState,

          // Lifecycle
          creationTime: account.creationTime,
          launchTime: account.creationTime,
          uptime: account.creationTime ? formatUptime(account.creationTime) : null,

          sizeGB: null, // Requires Metrics API call
          blobCount: null,
          cost: 5 + Math.random() * 30,
          tags: account.tags || {},
          connections: [],
        });
      }
      return accounts;
    } catch (e) {
      console.error('Azure Storage error:', e.message);
      return [];
    }
  }

  async getCosmosDBAccounts() {
    try {
      const cred = this.getCredential();
      const cosmosClient = new CosmosDBManagementClient(cred, this.subscriptionId);
      const accounts = [];

      for await (const account of cosmosClient.databaseAccounts.list()) {
        const rg = account.id?.split('/')[4] || 'unknown';

        accounts.push({
          id: `az-cosmos-${account.name}`,
          rawId: account.id,
          name: account.name || 'unnamed-cosmos',
          type: 'Cosmos DB Account',
          family: 'Database',
          provider: 'azure',
          region: account.location,
          resourceGroup: rg,
          status: account.provisioningState,
          health: account.provisioningState === 'Succeeded' ? 'healthy' : healthFromStatus(account.provisioningState),

          // Configuration
          kind: account.kind,
          databaseAccountOfferType: account.databaseAccountOfferType,
          consistencyLevel: account.consistencyPolicy?.defaultConsistencyLevel,

          // Network
          ip: null,
          documentEndpoint: account.documentEndpoint,
          publicNetworkAccess: account.publicNetworkAccess,
          ipRules: (account.ipRules || []).map(r => r.ipAddressOrRange),
          isVirtualNetworkFilterEnabled: account.isVirtualNetworkFilterEnabled || false,
          virtualNetworkRules: (account.virtualNetworkRules || []).length,

          // Geo-distribution
          geoReplication: (account.locations?.length || 0) > 1,
          writeLocations: account.writeLocations?.map(l => l.locationName) || [],
          readLocations: account.readLocations?.map(l => l.locationName) || [],
          failoverPolicies: (account.failoverPolicies || []).map(f => ({
            location: f.locationName,
            priority: f.failoverPriority,
          })),

          // Security
          disableKeyBasedMetadataWriteAccess: account.disableKeyBasedMetadataWriteAccess || false,
          enableFreeTier: account.enableFreeTier || false,
          enableAnalyticalStorage: account.enableAnalyticalStorage || false,
          backupPolicy: account.backupPolicy?.type,

          launchTime: null,
          uptime: null,
          cpu: null,
          dbConnections: null,
          cost: 25 + Math.random() * 100,
          tags: account.tags || {},
          connections: [],
        });
      }
      return accounts;
    } catch (e) {
      console.error('CosmosDB error:', e.message);
      return [];
    }
  }

  async getEventHubs() {
    try {
      const cred = this.getCredential();
      const ehClient = new EventHubManagementClient(cred, this.subscriptionId);
      const hubs = [];

      for await (const ns of ehClient.namespaces.list()) {
        const rg = ns.id?.split('/')[4] || 'unknown';
        let eventHubCount = 0;
        try {
          for await (const eh of ehClient.eventHubs.listByNamespace(rg, ns.name || '')) {
            eventHubCount++;
          }
        } catch {}

        hubs.push({
          id: `az-eventhub-${ns.name}`,
          rawId: ns.id,
          name: ns.name || 'unnamed-eventhub',
          type: 'Event Hub Namespace',
          family: 'Messaging',
          provider: 'azure',
          region: ns.location,
          resourceGroup: rg,
          status: ns.provisioningState,
          health: ns.provisioningState === 'Succeeded' ? 'healthy' : healthFromStatus(ns.provisioningState),

          // Tier & capacity
          tier: ns.sku?.tier,
          skuName: ns.sku?.name,
          capacity: ns.sku?.capacity,
          maximumThroughputUnits: ns.maximumThroughputUnits,
          isAutoInflateEnabled: ns.isAutoInflateEnabled || false,
          kafkaEnabled: ns.kafkaEnabled || false,
          zoneRedundant: ns.zoneRedundant || false,

          // Network
          endpoint: ns.serviceBusEndpoint,
          publicNetworkAccess: ns.publicNetworkAccess,

          // Namespaces & hubs
          eventHubCount,

          creationTime: ns.createdAt,
          launchTime: ns.createdAt,
          uptime: ns.createdAt ? formatUptime(ns.createdAt) : null,
          cost: 10 + Math.random() * 40,
          tags: ns.tags || {},
          connections: [],
        });
      }
      return hubs;
    } catch (e) {
      console.error('Event Hub error:', e.message);
      return [];
    }
  }

  async getFunctionApps() {
    try {
      const cred = this.getCredential();
      const webClient = new WebSiteManagementClient(cred, this.subscriptionId);
      const apps = [];

      for await (const app of webClient.webApps.list()) {
        if (!app.kind?.includes('functionapp')) continue;
        const rg = app.id?.split('/')[4] || 'unknown';

        // Fetch site config for runtime details
        let siteConfig = {};
        try {
          const sc = await webClient.webApps.getConfiguration(rg, app.name || '');
          siteConfig = {
            linuxFxVersion: sc.linuxFxVersion,
            windowsFxVersion: sc.windowsFxVersion,
            phpVersion: sc.phpVersion,
            pythonVersion: sc.pythonVersion,
            nodeVersion: sc.nodeVersion,
            dotnetFrameworkVersion: sc.netFrameworkVersion,
            javaVersion: sc.javaVersion,
            use32BitWorkerProcess: sc.use32BitWorkerProcess,
            alwaysOn: sc.alwaysOn,
            functionAppScaleLimit: sc.functionAppScaleLimit,
            minimumElasticInstanceCount: sc.minimumElasticInstanceCount,
            vnetRouteAllEnabled: sc.vnetRouteAllEnabled,
            http20Enabled: sc.http20Enabled,
            minTlsVersion: sc.minTlsVersion,
            ftpsState: sc.ftpsState,
          };
        } catch {}

        apps.push({
          id: `az-func-${app.name}`,
          rawId: app.id,
          name: app.name || 'unnamed-function',
          type: 'Azure Function App',
          family: 'Serverless',
          provider: 'azure',
          region: app.location,
          resourceGroup: rg,
          status: app.state,
          health: app.state === 'Running' ? 'healthy' : healthFromStatus(app.state),

          // Runtime
          kind: app.kind,
          runtime: siteConfig.linuxFxVersion || siteConfig.windowsFxVersion || 'Unknown',
          os: app.kind?.includes('linux') ? 'Linux' : 'Windows',

          // Endpoints
          defaultHostName: app.defaultHostName,
          enabledHostNames: app.enabledHostNames || [],
          httpsOnly: app.httpsOnly,

          // Network
          vnet: app.virtualNetworkSubnetId?.split('/')[app.virtualNetworkSubnetId?.split('/').indexOf('virtualNetworks') + 1] || null,
          vnetSubnetId: app.virtualNetworkSubnetId?.split('/').pop() || null,
          outboundIpAddresses: app.outboundIpAddresses?.split(',') || [],
          possibleOutboundIpAddresses: app.possibleOutboundIpAddresses?.split(',') || [],

          // Config details
          alwaysOn: siteConfig.alwaysOn,
          scaleLimit: siteConfig.functionAppScaleLimit,
          minElasticInstances: siteConfig.minimumElasticInstanceCount,
          minTlsVersion: siteConfig.minTlsVersion,
          ftpsState: siteConfig.ftpsState,

          // Identity
          identityType: app.identity?.type,

          launchTime: null,
          uptime: null,
          invocations: null,
          errors: null,
          duration: null,
          cost: 0.5 + Math.random() * 5,
          tags: app.tags || {},
          connections: [],
        });
      }
      return apps;
    } catch (e) {
      console.error('Azure Functions error:', e.message);
      return [];
    }
  }

  async getVirtualNetworks() {
    try {
      const cred = this.getCredential();
      const networkClient = new NetworkManagementClient(cred, this.subscriptionId);
      const vnets = [];

      for await (const vnet of networkClient.virtualNetworks.listAll()) {
        const rg = vnet.id?.split('/')[4] || 'unknown';

        // Build subnet details
        const subnets = (vnet.subnets || []).map(s => ({
          name: s.name,
          addressPrefix: s.addressPrefix,
          provisioningState: s.provisioningState,
          nsgId: s.networkSecurityGroup?.id?.split('/').pop() || null,
          routeTableId: s.routeTable?.id?.split('/').pop() || null,
          serviceEndpoints: (s.serviceEndpoints || []).map(se => se.service),
          delegations: (s.delegations || []).map(d => d.serviceName),
          privateEndpointNetworkPolicies: s.privateEndpointNetworkPolicies,
          privateLinkServiceNetworkPolicies: s.privateLinkServiceNetworkPolicies,
        }));

        // DNS settings
        const dnsServers = vnet.dhcpOptions?.dnsServers || [];

        vnets.push({
          id: `az-vnet-${vnet.name}`,
          rawId: vnet.id,
          name: vnet.name || 'unnamed-vnet',
          type: 'Virtual Network',
          family: 'Networking',
          provider: 'azure',
          region: vnet.location,
          resourceGroup: rg,
          status: vnet.provisioningState,
          health: vnet.provisioningState === 'Succeeded' ? 'healthy' : healthFromStatus(vnet.provisioningState),
          cidr: vnet.addressSpace?.addressPrefixes?.[0],
          addressPrefixes: vnet.addressSpace?.addressPrefixes || [],
          subnets,
          subnetCount: subnets.length,
          dnsServers,
          enableDdosProtection: vnet.enableDdosProtection || false,
          ddosProtectionPlan: vnet.ddosProtectionPlan?.id?.split('/').pop() || null,
          enableVmProtection: vnet.enableVmProtection || false,
          virtualNetworkPeerings: (vnet.virtualNetworkPeerings || []).map(p => ({
            name: p.name,
            remoteVnetId: p.remoteVirtualNetwork?.id?.split('/').pop() || null,
            state: p.peeringState,
            allowVnetAccess: p.allowVirtualNetworkAccess,
            allowForwardedTraffic: p.allowForwardedTraffic,
            allowGatewayTransit: p.allowGatewayTransit,
            useRemoteGateways: p.useRemoteGateways,
          })),
          peeringCount: (vnet.virtualNetworkPeerings || []).length,
          cost: 0,
          tags: vnet.tags || {},
          connections: [],
        });
      }
      return vnets;
    } catch (e) {
      return [];
    }
  }

  async getAlerts() {
    try {
      const cred = this.getCredential();
      const monitorClient = new MonitorClient(cred, this.subscriptionId);
      const alerts = [];
      for await (const rule of monitorClient.alertRules.listBySubscription()) {
        if (rule.isEnabled === false) continue;
        alerts.push({
          id: `az-alert-${rule.name}`,
          title: rule.name || 'Azure Alert',
          message: rule.description || 'Alert rule triggered',
          severity: 'warning',
          provider: 'azure',
          service: 'Azure Monitor',
          region: rule.location || 'global',
          time: new Date().toISOString(),
          acknowledged: false,
        });
      }
      return alerts;
    } catch (e) {
      console.error('Azure Monitor error:', e.message);
      return [];
    }
  }

  async getAllResources() {
    const results = await Promise.allSettled([
      this.getVirtualMachines(),
      this.getAKSClusters(),
      this.getSQLDatabases(),
      this.getStorageAccounts(),
      this.getCosmosDBAccounts(),
      this.getEventHubs(),
      this.getFunctionApps(),
      this.getVirtualNetworks(),
    ]);

    let allResources = [];
    for (const r of results) {
      if (r.status === 'fulfilled') allResources = allResources.concat(r.value);
    }
    buildAzureConnectionGraph(allResources);
    return allResources;
  }
}

function buildAzureConnectionGraph(resources) {
  const byRG = {};
  const byVnet = {};
  for (const r of resources) {
    const rg = r.resourceGroup;
    if (rg) {
      if (!byRG[rg]) byRG[rg] = [];
      byRG[rg].push(r.id);
    }
    if (r.vnet) {
      if (!byVnet[r.vnet]) byVnet[r.vnet] = [];
      byVnet[r.vnet].push(r.id);
    }
  }
  for (const r of resources) {
    const conns = new Set();
    const rg = r.resourceGroup;
    if (rg && byRG[rg]) {
      byRG[rg].filter(id => id !== r.id).slice(0, 6).forEach(id => conns.add(id));
    }
    if (r.vnet && byVnet[r.vnet]) {
      byVnet[r.vnet].filter(id => id !== r.id).slice(0, 4).forEach(id => conns.add(id));
    }
    r.connections = Array.from(conns).slice(0, 8);
  }
}

function formatUptime(since) {
  const ms = Date.now() - new Date(since).getTime();
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  if (d > 0) return `${d}d ${h}h`;
  return `${h}h`;
}

// reportService
const nodemailer = require('nodemailer');
const cron = require('node-cron');

const SMTP_USER = process.env.SMTP_USER || 'support@core5.co.in';
const SMTP_PASS = process.env.SMTP_PASS || 'JsC6DWiPJ7rv';
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.zoho.in';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465', 10);
const SMTP_FROM = process.env.SMTP_FROM || `"CloudNexus Monitor" <${SMTP_USER}>`;

// ── Razorpay ──────────────────────────────────────────────────────────────────
const Razorpay            = require('razorpay');
const RAZORPAY_KEY_ID     = process.env.RAZORPAY_KEY_ID     || 'rzp_test_SzR3zMr0VB5JJe';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'aDWZQB5VaysiQvDY2DO6KyRm';
const razorpay = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });

// ── Microsoft Graph / OneDrive Excel ──────────────────────────────────────────
const MS_TENANT_ID     = process.env.MS_TENANT_ID     || '';
const MS_CLIENT_ID     = process.env.MS_CLIENT_ID     || '';
const MS_CLIENT_SECRET = process.env.MS_CLIENT_SECRET || '';
const MS_USER_EMAIL    = process.env.MS_USER_EMAIL    || '';  // OneDrive owner's email
const MS_EXCEL_PATH    = process.env.MS_EXCEL_PATH    || 'CloudNexus/Contact_Submissions.xlsx';

const EXCEL_HEADERS = ['Name', 'Phone', 'Company', 'Email', 'Plan', 'Message', 'Submitted At'];

async function getMSToken() {
  const res = await fetch(
    `https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     MS_CLIENT_ID,
        client_secret: MS_CLIENT_SECRET,
        scope:         'https://graph.microsoft.com/.default',
      }).toString(),
    }
  );
  const data = await res.json();
  if (!data.access_token) {
    throw new Error('MS token error: ' + (data.error_description || JSON.stringify(data)));
  }
  return data.access_token;
}

async function appendToOneDriveExcel({ name, phone, company, email, plan, message }) {
  if (!MS_TENANT_ID || !MS_CLIENT_ID || !MS_CLIENT_SECRET || !MS_USER_EMAIL) {
    logger.warn('[OneDrive] MS Graph credentials not configured — skipping Excel append.');
    return;
  }

  const token = await getMSToken();
  // Build base URL: users/{email}/drive/root:/{path to xlsx}
  const base  = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(MS_USER_EMAIL)}/drive/root:/${MS_EXCEL_PATH.split('/').map(encodeURIComponent).join('/')}`;

  // Find the next empty row
  const rangeRes = await fetch(`${base}:/workbook/worksheets/Sheet1/usedRange(valuesOnly=true)`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  let nextRow = 2;
  if (rangeRes.ok) {
    const rangeData = await rangeRes.json();
    const rowCount  = rangeData.rowCount || 0;
    nextRow = rowCount + 1;

    // Write header row if sheet is empty
    if (rowCount === 0) {
      await fetch(`${base}:/workbook/worksheets/Sheet1/range(address='A1:G1')`, {
        method:  'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ values: [EXCEL_HEADERS] }),
      });
      nextRow = 2;
    }
  } else {
    const errBody = await rangeRes.text();
    throw new Error(`Graph usedRange ${rangeRes.status}: ${errBody}`);
  }

  const now      = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const patchRes = await fetch(
    `${base}:/workbook/worksheets/Sheet1/range(address='A${nextRow}:G${nextRow}')`,
    {
      method:  'PATCH',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ values: [[name || '', phone || '', company || '', email || '', plan || '', message || '', now]] }),
    }
  );

  if (!patchRes.ok) {
    const errBody = await patchRes.text();
    throw new Error(`Graph PATCH ${patchRes.status}: ${errBody}`);
  }
  logger.info(`[OneDrive] Row appended to Excel for: ${email}`);
}

const SEVERITY_COLOR = { critical: '#dc2626', warning: '#d97706', info: '#2563eb' };
const HEALTH_COLOR   = { healthy: '#16a34a', warning: '#d97706', critical: '#dc2626', unknown: '#6b7280' };
const PROVIDER_COLOR = { aws: '#FF9900', gcp: '#4285F4', azure: '#008AD7' };
const PROVIDER_LABEL = { aws: 'Amazon Web Services', gcp: 'Google Cloud Platform', azure: 'Microsoft Azure' };

// Inline HTML provider logos — SVG/PNG images are blocked by Gmail/Outlook even as CID attachments.
// Pure colored text that renders correctly inside ANY container (white circle or tinted box).
const PROVIDER_LOGO_BUFS = {}; // kept empty — no attachments needed

function providerLogoHtml(key, size = 24) {
  // Font size scales with the requested icon size
  const fs = Math.max(8, Math.round(size * 0.52));
  if (key === 'aws')   return `<span style="font-family:Arial,sans-serif;font-size:${fs}px;font-weight:900;color:#FF9900;letter-spacing:-0.5px;line-height:1;">aws</span>`;
  if (key === 'gcp')   return `<span style="font-family:Arial,sans-serif;font-size:${fs + 2}px;font-weight:900;color:#4285F4;letter-spacing:-1px;line-height:1;">G</span>`;
  if (key === 'azure') return `<span style="font-family:Arial,sans-serif;font-size:${fs}px;font-weight:900;color:#0078D4;letter-spacing:-0.5px;line-height:1;">Az</span>`;
  const color = PROVIDER_COLOR[key] || '#64748b';
  return `<span style="font-family:Arial,sans-serif;font-size:${fs}px;font-weight:700;color:${color};line-height:1;">${key.toUpperCase().slice(0,3)}</span>`;
}

const _fsSync = require('fs');
const SCHEDULE_FILE = require('path').join(__dirname, 'report_schedules.json');
function _loadScheduleFile() {
  try { return JSON.parse(_fsSync.readFileSync(SCHEDULE_FILE, 'utf8')); } catch { return {}; }
}
function _saveScheduleFile(obj) {
  try { _fsSync.writeFileSync(SCHEDULE_FILE, JSON.stringify(obj, null, 2), 'utf8'); } catch {}
}

class ReportService {
  constructor() {
    this.schedules = new Map(); // email -> { time, cronJob }
    this.cacheRef  = null;

    this.transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { type: 'LOGIN', user: SMTP_USER, pass: SMTP_PASS },
      tls: { rejectUnauthorized: false },
      debug: true,
      logger: true,
    });
  }

  setCache(getter) { this.cacheRef = getter; }

  _persist() {
    const obj = {};
    this.schedules.forEach(({ time }, email) => { obj[email] = time; });
    _saveScheduleFile(obj);
  }

  restoreFromFile() {
    const saved = _loadScheduleFile();
    Object.entries(saved).forEach(([email, time]) => {
      try { this.schedule(email, time); } catch {}
    });
  }

  schedule(email, time) {
    if (this.schedules.has(email)) {
      this.schedules.get(email).cronJob.stop();
    }
    const [hour, minute] = time.split(':');
    const job = cron.schedule(`${minute} ${hour} * * *`, () => {
      this.sendReport(email).catch(e => console.error(`[ReportService] send error: ${e.message}`));
    }, { timezone: 'Asia/Kolkata' });
    this.schedules.set(email, { time, cronJob: job });
    this._persist();
  }

  unschedule(email) {
    if (!this.schedules.has(email)) return false;
    this.schedules.get(email).cronJob.stop();
    this.schedules.delete(email);
    this._persist();
    return true;
  }

  getSchedule(email) {
    if (!this.schedules.has(email)) return null;
    return { email, time: this.schedules.get(email).time };
  }

  getAllSchedules() {
    return Array.from(this.schedules.entries()).map(([email, { time }]) => ({ email, time }));
  }

  async sendReport(email) {
    // Resolve org scope for this user
    let orgAdmin = email ? resolveOrgAdmin(email) : '';
    // Fallback: if DB lookup fails or user isn't in users table yet, use the email itself as the org key
    if (!orgAdmin) orgAdmin = (email || '').toLowerCase().trim();

    logger.info(`[ReportService] sendReport → email=${email} orgAdmin=${orgAdmin}`);

    const orgCache = getOrgCache(orgAdmin);

    // If a startup/background fetch is already in progress, wait for it to complete (up to 40s)
    const waitStart = Date.now();
    while (Date.now() - waitStart < 40000) {
      const anyFetching = ['aws', 'gcp', 'azure'].some(p => orgCache[p]?.fetching);
      if (!anyFetching) break;
      await new Promise(r => setTimeout(r, 800));
    }

    const totalCached = (orgCache.aws?.resources?.length || 0)
                      + (orgCache.gcp?.resources?.length || 0)
                      + (orgCache.azure?.resources?.length || 0);

    logger.info(`[ReportService] cache state → aws=${orgCache.aws?.resources?.length||0} gcp=${orgCache.gcp?.resources?.length||0} azure=${orgCache.azure?.resources?.length||0}`);

    if (totalCached === 0) {
      // Nothing in cache even after waiting — ensure credential store is loaded from DB
      let toFetch = ['aws', 'gcp', 'azure'].filter(p => credentialStore.has(orgAdmin, p));

      if (toFetch.length === 0) {
        logger.info(`[ReportService] credential store empty for ${orgAdmin}, reloading from DB`);
        try {
          const dbSessions = db.loadAllCloudSessions('monitoring');
          for (const s of dbSessions) {
            const oa = (s.org_admin || '').toLowerCase().trim();
            if (oa === orgAdmin && s.credentials && !credentialStore.has(oa, s.provider)) {
              credentialStore.set(oa, s.provider, s.credentials);
              logger.info(`[ReportService] reloaded ${s.provider} creds for ${oa} from DB`);
            }
          }
        } catch (e) {
          logger.error(`[ReportService] DB session reload failed: ${e.message}`);
        }
        toFetch = ['aws', 'gcp', 'azure'].filter(p => credentialStore.has(orgAdmin, p));
      }

      if (toFetch.length > 0) {
        logger.info(`[ReportService] fetching fresh data for providers: ${toFetch.join(', ')}`);
        try {
          await Promise.all(toFetch.map(p => fetchProvider(p, orgAdmin)));
        } catch (e) {
          logger.error(`[ReportService] pre-send fetch failed: ${e.message}`);
        }
      } else {
        logger.warn(`[ReportService] no credentials found for orgAdmin=${orgAdmin} — report will show empty data`);
      }
    }

    // Re-read cache after fetch (same object ref — fetchProvider mutates it in place)
    const cache    = getOrgCache(orgAdmin);
    const alerts   = cache.alerts    || [];
    const awsRes   = cache.aws?.resources   || [];
    const gcpRes   = cache.gcp?.resources   || [];
    const azureRes = cache.azure?.resources || [];
    const all      = [...awsRes, ...gcpRes, ...azureRes];

    logger.info(`[ReportService] sending report → resources aws=${awsRes.length} gcp=${gcpRes.length} azure=${azureRes.length} alerts=${alerts.length}`);

    const securityGroups   = awsRes.filter(r => r.type === 'Security Group');
    const routeTables      = awsRes.filter(r => r.type === 'Route Table');
    const internetGateways = awsRes
      .filter(r => r.type === 'VPC' && r.internetGateway)
      .map(r => ({ ...r.internetGateway, vpcId: r.rawId, vpcName: r.name, region: r.region }));

    const html = this._buildTemplate(alerts, all, { aws: awsRes, gcp: gcpRes, azure: azureRes }, { securityGroups, internetGateways, routeTables });
    const dateStr = new Date().toLocaleDateString('en-IN', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    await this.transporter.sendMail({
      from:    SMTP_FROM,
      to:      email,
      subject: `CloudNexus Daily Infrastructure Report — ${dateStr}`,
      html,
    });
  }

  _buildTemplate(alerts, allResources, providers, { securityGroups = [], internetGateways = [], routeTables = [] } = {}) {
    const now      = new Date();
    const dateStr  = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr  = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    const reportId = 'CNX-' + now.getTime().toString(36).toUpperCase().slice(-8);

    const active   = alerts.filter(a => !a.acknowledged);
    const critical = active.filter(a => a.severity === 'critical');
    const warnings = active.filter(a => a.severity === 'warning');
    const infos    = active.filter(a => a.severity === 'info');

    const healthy  = allResources.filter(r => r.health === 'healthy').length;
    const warn     = allResources.filter(r => r.health === 'warning').length;
    const crit     = allResources.filter(r => r.health === 'critical').length;
    const total    = allResources.length;

    const overallStatus  = critical.length > 0 ? 'CRITICAL' : warnings.length > 0 ? 'WARNING' : 'HEALTHY';
    const statusColor    = critical.length > 0 ? '#ef4444' : warnings.length > 0 ? '#f59e0b' : '#10b981';
    const statusBg       = critical.length > 0 ? 'rgba(239,68,68,0.12)' : warnings.length > 0 ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)';
    const statusBorder   = critical.length > 0 ? 'rgba(239,68,68,0.35)' : warnings.length > 0 ? 'rgba(245,158,11,0.35)' : 'rgba(16,185,129,0.35)';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CloudNexus Daily Infrastructure Report</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#0a1628;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a1628;">
  <tr><td align="center" style="padding:32px 16px;">
    <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;">

      <!-- HEADER -->
      <tr>
        <td style="background:#0c1e35;padding:48px 52px 44px;border-radius:12px 12px 0 0;">

          <!-- Branding -->
          <div style="font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;line-height:1;margin-bottom:8px;">
            Cloud<span style="color:#3b82f6;">Nexus</span>
          </div>
          <div style="font-size:10px;color:#3d6080;font-weight:600;letter-spacing:4px;text-transform:uppercase;margin-bottom:32px;">
            Multi-Cloud Intelligence Platform
          </div>

          <!-- Rule -->
          <div style="height:1px;background:rgba(255,255,255,0.06);margin-bottom:32px;"></div>

          <!-- Title -->
          <div style="font-size:40px;font-weight:800;color:#ffffff;line-height:1.1;letter-spacing:-1.5px;margin-bottom:14px;">
            Daily Infrastructure<br>Status Report
          </div>
          <div style="font-size:14px;color:#3d6080;line-height:1.6;margin-bottom:40px;">
            Comprehensive multi-cloud infrastructure overview, alert summary, and service health digest
          </div>

          <!-- Metadata row -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-right:24px;border-right:1px solid rgba(255,255,255,0.06);">
                <div style="font-size:10px;font-weight:600;color:#3d6080;text-transform:uppercase;letter-spacing:2.5px;margin-bottom:7px;">Report Date</div>
                <div style="font-size:14px;font-weight:700;color:#ffffff;">${dateStr}</div>
              </td>
              <td style="padding-left:24px;padding-right:24px;border-right:1px solid rgba(255,255,255,0.06);">
                <div style="font-size:10px;font-weight:600;color:#3d6080;text-transform:uppercase;letter-spacing:2.5px;margin-bottom:7px;">Report ID</div>
                <div style="font-size:14px;font-weight:700;color:#ffffff;">${reportId}</div>
              </td>
              <td style="padding-left:24px;padding-right:24px;border-right:1px solid rgba(255,255,255,0.06);">
                <div style="font-size:10px;font-weight:600;color:#3d6080;text-transform:uppercase;letter-spacing:2.5px;margin-bottom:7px;">Coverage</div>
                <div style="font-size:14px;font-weight:700;color:#ffffff;">All Providers</div>
              </td>
              <td style="padding-left:24px;">
                <div style="font-size:10px;font-weight:600;color:#3d6080;text-transform:uppercase;letter-spacing:2.5px;margin-bottom:7px;">Generated</div>
                <div style="font-size:14px;font-weight:700;color:#ffffff;">${timeStr} IST</div>
              </td>
            </tr>
          </table>

          <!-- Provider badges with logos -->
          <table cellpadding="0" cellspacing="0" style="margin-top:32px;">
            <tr>
              <td style="padding-right:10px;">
                <span style="display:inline-block;background:rgba(255,153,0,0.13);border:1.5px solid #FF9900;color:#FF9900;border-radius:100px;padding:6px 18px 6px 8px;font-size:12px;font-weight:600;letter-spacing:0.3px;">
                  <span style="display:inline-block;background:#ffffff;border-radius:50%;width:20px;height:20px;vertical-align:middle;text-align:center;margin-right:6px;line-height:20px;">${providerLogoHtml('aws', 14)}</span>Amazon AWS</span>
              </td>
              <td style="padding-right:10px;">
                <span style="display:inline-block;background:rgba(66,133,244,0.13);border:1.5px solid rgba(66,133,244,0.55);color:#6aacff;border-radius:100px;padding:6px 18px 6px 8px;font-size:12px;font-weight:600;letter-spacing:0.3px;">
                  <span style="display:inline-block;background:#ffffff;border-radius:50%;width:20px;height:20px;vertical-align:middle;text-align:center;margin-right:6px;line-height:20px;">${providerLogoHtml('gcp', 14)}</span>Google Cloud</span>
              </td>
              <td>
                <span style="display:inline-block;background:rgba(0,120,212,0.13);border:1.5px solid rgba(0,120,212,0.55);color:#6aacff;border-radius:100px;padding:6px 18px 6px 8px;font-size:12px;font-weight:600;letter-spacing:0.3px;">
                  <span style="display:inline-block;background:#ffffff;border-radius:50%;width:20px;height:20px;vertical-align:middle;text-align:center;margin-right:6px;line-height:20px;">${providerLogoHtml('azure', 14)}</span>Microsoft Azure</span>
              </td>
            </tr>
          </table>

          <!-- Status banner -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:32px;">
            <tr>
              <td style="background:${statusBg};border:1px solid ${statusBorder};border-radius:8px;padding:14px 20px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td>
                      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${statusColor};vertical-align:middle;margin-right:8px;"></span>
                      <span style="font-size:13px;font-weight:700;color:${statusColor};vertical-align:middle;">Infrastructure Status: ${overallStatus}</span>
                    </td>
                    <td align="right">
                      <span style="font-size:12px;color:#3d6080;">${total} resources monitored</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- SUMMARY STATS -->
      <tr>
        <td style="background:#ffffff;padding:32px 44px 24px;">
          <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:2.5px;margin-bottom:20px;">Today's Summary</div>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              ${this._statCard('Active Alerts',    active.length,    '#ef4444')}
              ${this._statCard('Critical',         critical.length,  '#dc2626')}
              ${this._statCard('Warnings',         warnings.length,  '#f59e0b')}
              ${this._statCard('Info Alerts',      infos.length,     '#3b82f6')}
            </tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;">
            <tr>
              ${this._statCard('Total Resources',  total,            '#6366f1')}
              ${this._statCard('Healthy',          healthy,          '#10b981')}
              ${this._statCard('Degraded',         warn,             '#f59e0b')}
              ${this._statCard('Critical Svcs',    crit,             '#dc2626')}
            </tr>
          </table>
        </td>
      </tr>

      <!-- DIVIDER -->
      <tr><td style="background:#ffffff;padding:0 44px;"><div style="height:1px;background:#f1f5f9;"></div></td></tr>

      <!-- PROVIDER HEALTH -->
      <tr>
        <td style="background:#ffffff;padding:28px 44px;">
          <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:2.5px;margin-bottom:20px;">Provider Health</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
            ${this._providerRow('aws',   providers.aws   || [])}
            ${this._providerRow('gcp',   providers.gcp   || [])}
            ${this._providerRow('azure', providers.azure || [])}
          </table>
        </td>
      </tr>

      <!-- DIVIDER -->
      <tr><td style="background:#ffffff;padding:0 44px;"><div style="height:1px;background:#f1f5f9;"></div></td></tr>

      <!-- ACTIVE ALERTS -->
      <tr>
        <td style="background:#ffffff;padding:28px 44px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
            <tr>
              <td>
                <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:2.5px;">Active Alerts</div>
              </td>
              <td align="right">
                ${active.length > 0
                  ? `<span style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:600;">${active.length} unresolved</span>`
                  : `<span style="background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:600;">All clear</span>`}
              </td>
            </tr>
          </table>
          ${active.length === 0
            ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:28px;text-align:center;">
                <div style="font-size:15px;font-weight:600;color:#16a34a;margin-bottom:4px;">No Active Alerts</div>
                <div style="font-size:12px;color:#86efac;">Your infrastructure is running smoothly.</div>
               </div>`
            : `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
                <tr style="background:#f8fafc;">
                  <td style="padding:10px 14px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;">Severity</td>
                  <td style="padding:10px 14px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;">Alert</td>
                  <td style="padding:10px 14px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;">Provider</td>
                  <td style="padding:10px 14px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;">Service</td>
                  <td style="padding:10px 14px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;">Time</td>
                </tr>
                ${active.slice(0, 30).map((a, i) => this._alertRow(a, i)).join('')}
                ${active.length > 30 ? `<tr><td colspan="5" style="padding:12px 14px;text-align:center;font-size:12px;color:#94a3b8;background:#f8fafc;border-top:1px solid #e2e8f0;">+${active.length - 30} more alerts</td></tr>` : ''}
               </table>`
          }
        </td>
      </tr>

      ${allResources.length > 0 ? `
      <!-- DIVIDER -->
      <tr><td style="background:#ffffff;padding:0 44px;"><div style="height:1px;background:#f1f5f9;"></div></td></tr>

      <!-- SERVICE HEALTH -->
      <tr>
        <td style="background:#ffffff;padding:28px 44px 36px;">
          <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:2.5px;margin-bottom:20px;">Service Health Breakdown</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
            <tr style="background:#f8fafc;">
              <td style="padding:10px 14px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;">Service</td>
              <td style="padding:10px 14px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;">Provider</td>
              <td style="padding:10px 14px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;">Type</td>
              <td style="padding:10px 14px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;">Region</td>
              <td style="padding:10px 14px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;">Health</td>
              <td style="padding:10px 14px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;">CPU</td>
            </tr>
            ${allResources.slice(0, 25).map((r, i) => this._resourceRow(r, i)).join('')}
            ${allResources.length > 25 ? `<tr><td colspan="6" style="padding:12px 14px;text-align:center;font-size:12px;color:#94a3b8;background:#f8fafc;border-top:1px solid #e2e8f0;">+${allResources.length - 25} more services</td></tr>` : ''}
          </table>
        </td>
      </tr>
      ` : ''}

      ${securityGroups.length > 0 ? `
      <!-- DIVIDER -->
      <tr><td style="background:#ffffff;padding:0 44px;"><div style="height:1px;background:#f1f5f9;"></div></td></tr>

      <!-- SECURITY GROUPS -->
      <tr>
        <td style="background:#ffffff;padding:28px 44px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
            <tr>
              <td><div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:2.5px;">Security Groups</div></td>
              <td align="right"><span style="background:#eff6ff;color:#3b82f6;border:1px solid #bfdbfe;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:600;">${securityGroups.length} groups</span></td>
            </tr>
          </table>
          ${securityGroups.slice(0, 20).map((sg, i) => this._sgSection(sg, i)).join('')}
          ${securityGroups.length > 20 ? `<div style="padding:10px 0;text-align:center;font-size:12px;color:#94a3b8;">+${securityGroups.length - 20} more security groups</div>` : ''}
        </td>
      </tr>
      ` : ''}

      ${internetGateways.length > 0 ? `
      <!-- DIVIDER -->
      <tr><td style="background:#ffffff;padding:0 44px;"><div style="height:1px;background:#f1f5f9;"></div></td></tr>

      <!-- INTERNET GATEWAYS -->
      <tr>
        <td style="background:#ffffff;padding:28px 44px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
            <tr>
              <td><div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:2.5px;">Internet Gateways</div></td>
              <td align="right"><span style="background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:600;">${internetGateways.length} gateways</span></td>
            </tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
            <tr style="background:#f8fafc;">
              <td style="padding:10px 14px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;">Gateway ID</td>
              <td style="padding:10px 14px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;">VPC</td>
              <td style="padding:10px 14px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;">State</td>
              <td style="padding:10px 14px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;">Region</td>
            </tr>
            ${internetGateways.map((igw, i) => this._igwRow(igw, i)).join('')}
          </table>
        </td>
      </tr>
      ` : ''}

      ${routeTables.length > 0 ? `
      <!-- DIVIDER -->
      <tr><td style="background:#ffffff;padding:0 44px;"><div style="height:1px;background:#f1f5f9;"></div></td></tr>

      <!-- ROUTE TABLES -->
      <tr>
        <td style="background:#ffffff;padding:28px 44px 36px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
            <tr>
              <td><div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:2.5px;">Route Tables</div></td>
              <td align="right"><span style="background:#faf5ff;color:#7c3aed;border:1px solid #ddd6fe;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:600;">${routeTables.length} tables</span></td>
            </tr>
          </table>
          ${routeTables.slice(0, 15).map((rt, i) => this._rtSection(rt, i)).join('')}
          ${routeTables.length > 15 ? `<div style="padding:10px 0;text-align:center;font-size:12px;color:#94a3b8;">+${routeTables.length - 15} more route tables</div>` : ''}
        </td>
      </tr>
      ` : ''}

      <!-- FOOTER -->
      <tr>
        <td style="background:#0c1e35;border-radius:0 0 12px 12px;padding:28px 52px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <div style="font-size:18px;font-weight:800;color:#ffffff;letter-spacing:-0.3px;margin-bottom:4px;">
                  Cloud<span style="color:#3b82f6;">Nexus</span>
                </div>
                <div style="font-size:11px;color:#2a4a65;margin-top:2px;">Automated Infrastructure Intelligence</div>
              </td>
              <td align="right" valign="middle">
                <div style="font-size:11px;color:#2a4a65;line-height:1.8;">
                  <div>Generated: ${timeStr} IST</div>
                  <div>Â© ${now.getFullYear()} CloudNexus Monitor</div>
                </div>
              </td>
            </tr>
          </table>
          <div style="height:1px;background:rgba(255,255,255,0.05);margin:20px 0 16px;"></div>
          <div style="font-size:11px;color:#2a4a65;line-height:1.8;">
            You are receiving this report because daily CloudNexus reports are enabled for this address.
            To update your schedule or unsubscribe, open the <strong style="color:#3b82f6;">CloudNexus Dashboard</strong> and go to Alerts &rarr; Daily Reports.
          </div>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
  }

  _statCard(label, value, color) {
    return `
    <td width="25%" style="padding:0 5px;">
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-top:3px solid ${color};border-radius:8px;padding:18px 14px;text-align:center;">
        <div style="font-size:30px;font-weight:800;color:${color};line-height:1;margin-bottom:7px;">${value}</div>
        <div style="font-size:10px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:1px;">${label}</div>
      </div>
    </td>`;
  }

  _providerRow(key, resources) {
    const total   = resources.length;
    const healthy = resources.filter(r => r.health === 'healthy').length;
    const warn    = resources.filter(r => r.health === 'warning').length;
    const crit    = resources.filter(r => r.health === 'critical').length;
    const color   = PROVIDER_COLOR[key] || '#64748b';
    const label   = PROVIDER_LABEL[key] || key.toUpperCase();
    const pct     = total > 0 ? Math.round((healthy / total) * 100) : 0;

    return `
    <tr>
      <td style="padding:12px 14px;border-bottom:1px solid #f1f5f9;vertical-align:middle;">
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="padding-right:10px;vertical-align:middle;">
            <div style="width:36px;height:36px;background:${color}18;border-radius:8px;text-align:center;line-height:36px;box-sizing:border-box;">
              ${providerLogoHtml(key, 24)}
            </div>
          </td>
          <td style="vertical-align:middle;">
            <div style="font-size:13px;font-weight:600;color:#1e293b;">${label}</div>
            <div style="font-size:11px;color:#64748b;margin-top:1px;">${total} resources</div>
          </td>
        </tr></table>
      </td>
      <td style="padding:12px 14px;border-bottom:1px solid #f1f5f9;">
        <table cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding-right:12px;">
              <span style="background:#f0fdf4;color:#16a34a;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:600;">âœ“ ${healthy} healthy</span>
            </td>
            <td style="padding-right:12px;">
              <span style="background:#fffbeb;color:#d97706;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:600;">âš  ${warn} warning</span>
            </td>
            <td>
              <span style="background:#fef2f2;color:#dc2626;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:600;">âœ— ${crit} critical</span>
            </td>
          </tr>
        </table>
      </td>
      <td style="padding:12px 14px;border-bottom:1px solid #f1f5f9;text-align:right;vertical-align:middle;">
        <div style="font-size:13px;font-weight:700;color:${pct >= 80 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626'};">${pct}% healthy</div>
      </td>
    </tr>`;
  }

  _alertRow(alert, index) {
    const bg       = index % 2 === 0 ? '#ffffff' : '#f8fafc';
    const sevColor = SEVERITY_COLOR[alert.severity] || '#64748b';
    const sevBg    = alert.severity === 'critical' ? '#fef2f2' : alert.severity === 'warning' ? '#fffbeb' : '#eff6ff';
    const sevIcon  = alert.severity === 'critical' ? 'ðŸ”´' : alert.severity === 'warning' ? 'ðŸŸ¡' : 'ðŸ”µ';
    const provColor = PROVIDER_COLOR[alert.provider] || '#64748b';
    const prov     = (alert.provider || '').toUpperCase();
    const timeLabel = alert.time ? new Date(alert.time).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:true }) : 'â€”';

    return `
    <tr style="background:${bg};">
      <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;vertical-align:middle;">
        <span style="background:${sevBg};color:${sevColor};padding:3px 8px;border-radius:6px;font-size:11px;font-weight:600;white-space:nowrap;">
          ${sevIcon} ${(alert.severity || '').toUpperCase()}
        </span>
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;vertical-align:middle;">
        <div style="font-size:12px;font-weight:600;color:#1e293b;">${this._escape(alert.title || '')}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px;">${this._escape((alert.message || '').substring(0, 80))}${(alert.message || '').length > 80 ? '...' : ''}</div>
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;vertical-align:middle;">
        <span style="background:${provColor}15;color:${provColor};padding:3px 8px;border-radius:6px;font-size:11px;font-weight:600;">${prov}</span>
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;vertical-align:middle;">
        <div style="font-size:11px;color:#475569;">${this._escape(alert.service || alert.region || 'â€”')}</div>
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;vertical-align:middle;white-space:nowrap;">
        <div style="font-size:11px;color:#64748b;">${timeLabel}</div>
      </td>
    </tr>`;
  }

  _resourceRow(r, index) {
    const bg        = index % 2 === 0 ? '#ffffff' : '#f8fafc';
    const health    = r.health || 'unknown';
    const hColor    = HEALTH_COLOR[health] || '#6b7280';
    const hBg       = health === 'healthy' ? '#f0fdf4' : health === 'warning' ? '#fffbeb' : health === 'critical' ? '#fef2f2' : '#f8fafc';
    const hIcon     = health === 'healthy' ? 'âœ“' : health === 'warning' ? 'âš ' : health === 'critical' ? 'âœ—' : '?';
    const provColor = PROVIDER_COLOR[r.provider] || '#64748b';
    const cpu       = r.cpu != null ? `${Math.round(r.cpu)}%` : 'â€”';

    return `
    <tr style="background:${bg};">
      <td style="padding:9px 14px;border-bottom:1px solid #f1f5f9;vertical-align:middle;">
        <div style="font-size:12px;font-weight:600;color:#1e293b;">${this._escape(r.name || r.id || 'â€”')}</div>
      </td>
      <td style="padding:9px 14px;border-bottom:1px solid #f1f5f9;vertical-align:middle;">
        <span style="background:${provColor}15;color:${provColor};padding:2px 7px;border-radius:5px;font-size:11px;font-weight:600;">${(r.provider || '').toUpperCase()}</span>
      </td>
      <td style="padding:9px 14px;border-bottom:1px solid #f1f5f9;vertical-align:middle;">
        <div style="font-size:11px;color:#475569;">${this._escape(r.type || r.family || 'â€”')}</div>
      </td>
      <td style="padding:9px 14px;border-bottom:1px solid #f1f5f9;vertical-align:middle;">
        <div style="font-size:11px;color:#475569;">${this._escape(r.region || 'â€”')}</div>
      </td>
      <td style="padding:9px 14px;border-bottom:1px solid #f1f5f9;vertical-align:middle;">
        <span style="background:${hBg};color:${hColor};padding:2px 7px;border-radius:5px;font-size:11px;font-weight:600;">${hIcon} ${health}</span>
      </td>
      <td style="padding:9px 14px;border-bottom:1px solid #f1f5f9;vertical-align:middle;text-align:center;">
        <div style="font-size:11px;color:${r.cpu > 80 ? '#dc2626' : r.cpu > 60 ? '#d97706' : '#16a34a'};font-weight:600;">${cpu}</div>
      </td>
    </tr>`;
  }

  _escape(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  _portRange(rule) {
    if (rule.protocol === 'All') return '<span style="color:#94a3b8;font-style:italic;">All Traffic</span>';
    if (rule.fromPort == null) return '<span style="color:#94a3b8;font-style:italic;">All</span>';
    if (rule.fromPort === rule.toPort) return `<strong>${rule.fromPort}</strong>`;
    return `<strong>${rule.fromPort}</strong>&ndash;<strong>${rule.toPort}</strong>`;
  }

  _sourceBadges(entries) {
    if (!entries || !entries.length) return '<span style="color:#94a3b8;">â€”</span>';
    return entries.map(src => {
      const val = typeof src === 'string' ? src : src.value || '';
      const isSG = val.startsWith('sg-');
      if (isSG) {
        const label = (typeof src === 'object' && src.name) ? `${val} (${this._escape(src.name)})` : val;
        return `<span style="display:inline-block;background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:4px;padding:1px 7px;font-size:10px;font-weight:600;margin:1px 2px 1px 0;">${this._escape(label)}</span>`;
      }
      const desc = (typeof src === 'object' && src.desc) ? ` <span style="color:#94a3b8;">(${this._escape(src.desc)})</span>` : '';
      return `<span style="font-size:11px;color:#475569;">${this._escape(val)}${desc}</span>`;
    }).join(' ');
  }

  _sgSection(sg, index) {
    const inRules  = sg.inboundRules  || [];
    const outRules = sg.outboundRules || [];
    const borderColor = index % 2 === 0 ? '#e2e8f0' : '#e2e8f0';

    const rulesTable = (rules, dir) => {
      const isIn = dir === 'in';
      const accentColor  = isIn ? '#2563eb' : '#059669';
      const headerBg     = isIn ? '#eff6ff'  : '#f0fdf4';
      const headerBorder = isIn ? '#bfdbfe'  : '#bbf7d0';
      const colLabel     = isIn ? 'Source'   : 'Destination';
      if (!rules.length) return `<div style="padding:8px 16px 12px;font-size:11px;color:#94a3b8;font-style:italic;">No ${isIn ? 'inbound' : 'outbound'} rules defined.</div>`;
      return `
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid #f1f5f9;">
        <tr style="background:${headerBg};">
          <td style="padding:8px 14px;font-size:10px;font-weight:700;color:${accentColor};text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid ${headerBorder};width:80px;">Protocol</td>
          <td style="padding:8px 14px;font-size:10px;font-weight:700;color:${accentColor};text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid ${headerBorder};width:110px;">Port Range</td>
          <td style="padding:8px 14px;font-size:10px;font-weight:700;color:${accentColor};text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid ${headerBorder};">${colLabel}</td>
        </tr>
        ${rules.map((rule, ri) => `
        <tr style="background:${ri % 2 === 0 ? '#ffffff' : '#fafafa'};">
          <td style="padding:8px 14px;font-size:11px;color:#334155;border-bottom:1px solid #f1f5f9;">${this._escape(String(rule.protocol))}</td>
          <td style="padding:8px 14px;font-size:11px;color:#334155;border-bottom:1px solid #f1f5f9;">${this._portRange(rule)}</td>
          <td style="padding:8px 14px;font-size:11px;border-bottom:1px solid #f1f5f9;">${this._sourceBadges(isIn ? rule.sources : rule.destinations)}</td>
        </tr>`).join('')}
      </table>`;
    };

    return `
    <div style="margin-bottom:14px;border:1px solid ${borderColor};border-radius:8px;overflow:hidden;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;">
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;">
            <div style="font-size:13px;font-weight:700;color:#0f172a;">${this._escape(sg.name)}</div>
            <div style="margin-top:3px;">
              <span style="font-size:10px;color:#64748b;font-family:monospace;">${sg.rawId}</span>
              &nbsp;&bull;&nbsp;
              <span style="font-size:10px;color:#64748b;">VPC: ${this._escape(sg.vpcId || 'â€”')}</span>
              &nbsp;&bull;&nbsp;
              <span style="font-size:10px;color:#64748b;">${this._escape(sg.region || '')}</span>
              ${sg.description ? `&nbsp;&bull;&nbsp;<span style="font-size:10px;color:#94a3b8;">${this._escape(sg.description)}</span>` : ''}
            </div>
          </td>
          <td align="right" style="padding:12px 16px;border-bottom:1px solid #e2e8f0;white-space:nowrap;">
            <span style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;padding:2px 9px;border-radius:4px;font-size:10px;font-weight:700;margin-right:4px;">${inRules.length} inbound</span>
            <span style="background:#f0fdf4;color:#059669;border:1px solid #bbf7d0;padding:2px 9px;border-radius:4px;font-size:10px;font-weight:700;">${outRules.length} outbound</span>
          </td>
        </tr>
      </table>
      <div style="padding:0 0 0 0;">
        <div style="padding:8px 16px 4px;font-size:10px;font-weight:700;color:#2563eb;text-transform:uppercase;letter-spacing:1px;">Inbound Rules</div>
        ${rulesTable(inRules, 'in')}
        <div style="padding:12px 16px 4px;font-size:10px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:1px;">Outbound Rules</div>
        ${rulesTable(outRules, 'out')}
      </div>
    </div>`;
  }

  _igwRow(igw, index) {
    const bg = index % 2 === 0 ? '#ffffff' : '#f8fafc';
    const stateColor = (igw.state || '').toLowerCase() === 'available' ? '#059669' : '#d97706';
    const stateBg    = (igw.state || '').toLowerCase() === 'available' ? '#f0fdf4'  : '#fffbeb';
    return `
    <tr style="background:${bg};">
      <td style="padding:11px 14px;border-bottom:1px solid #f1f5f9;font-size:12px;font-weight:600;color:#0f172a;font-family:monospace;">${this._escape(igw.id || 'â€”')}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #f1f5f9;font-size:11px;color:#475569;">${this._escape(igw.vpcId || 'â€”')}${igw.vpcName && igw.vpcName !== igw.vpcId ? ` <span style="color:#94a3b8;">(${this._escape(igw.vpcName)})</span>` : ''}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #f1f5f9;">
        <span style="background:${stateBg};color:${stateColor};padding:2px 9px;border-radius:4px;font-size:11px;font-weight:600;">${this._escape(igw.state || 'â€”')}</span>
      </td>
      <td style="padding:11px 14px;border-bottom:1px solid #f1f5f9;font-size:11px;color:#64748b;">${this._escape(igw.region || 'â€”')}</td>
    </tr>`;
  }

  _rtSection(rt, index) {
    const associations = rt.associations || [];
    const subnets      = associations.filter(a => a.subnetId).map(a => a.subnetId);
    const isMain       = rt.isMain || associations.some(a => a.isMain);
    const routes       = rt.routes || [];

    return `
    <div style="margin-bottom:14px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;">
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;">
            <div style="font-size:13px;font-weight:700;color:#0f172a;">
              ${this._escape(rt.name)}
              ${isMain ? `<span style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;padding:1px 7px;border-radius:4px;font-size:10px;font-weight:700;margin-left:7px;vertical-align:middle;">MAIN</span>` : ''}
            </div>
            <div style="margin-top:3px;">
              <span style="font-size:10px;color:#64748b;font-family:monospace;">${rt.rawId}</span>
              &nbsp;&bull;&nbsp;
              <span style="font-size:10px;color:#64748b;">VPC: ${this._escape(rt.vpcId || 'â€”')}</span>
              &nbsp;&bull;&nbsp;
              <span style="font-size:10px;color:#64748b;">${this._escape(rt.region || '')}</span>
              ${subnets.length ? `&nbsp;&bull;&nbsp;<span style="font-size:10px;color:#94a3b8;">Subnets: ${subnets.map(s => this._escape(s)).join(', ')}</span>` : ''}
            </div>
          </td>
          <td align="right" style="padding:12px 16px;border-bottom:1px solid #e2e8f0;white-space:nowrap;">
            <span style="background:#faf5ff;color:#7c3aed;border:1px solid #ddd6fe;padding:2px 9px;border-radius:4px;font-size:10px;font-weight:700;">${routes.length} routes</span>
          </td>
        </tr>
      </table>
      ${routes.length > 0 ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr style="background:#faf5ff;">
          <td style="padding:8px 14px;font-size:10px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #ddd6fe;width:180px;">Destination</td>
          <td style="padding:8px 14px;font-size:10px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #ddd6fe;">Target</td>
          <td style="padding:8px 14px;font-size:10px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #ddd6fe;width:80px;">Status</td>
          <td style="padding:8px 14px;font-size:10px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #ddd6fe;width:100px;">Origin</td>
        </tr>
        ${routes.map((route, ri) => {
          const t = route.target || '';
          const targetColor = t.startsWith('igw-') ? '#2563eb' : t.startsWith('nat-') ? '#7c3aed' : t === 'local' ? '#059669' : t.startsWith('tgw-') ? '#d97706' : '#475569';
          const stateBg    = route.state === 'active' ? '#f0fdf4' : '#fef2f2';
          const stateColor = route.state === 'active' ? '#059669' : '#dc2626';
          return `
          <tr style="background:${ri % 2 === 0 ? '#ffffff' : '#fafafa'};">
            <td style="padding:8px 14px;font-size:11px;font-weight:600;color:#0f172a;border-bottom:1px solid #f1f5f9;font-family:monospace;">${this._escape(route.destination)}</td>
            <td style="padding:8px 14px;font-size:11px;color:${targetColor};font-weight:600;border-bottom:1px solid #f1f5f9;font-family:monospace;">${this._escape(t)}</td>
            <td style="padding:8px 14px;border-bottom:1px solid #f1f5f9;">
              <span style="background:${stateBg};color:${stateColor};padding:2px 7px;border-radius:4px;font-size:10px;font-weight:600;">${this._escape(route.state || 'â€”')}</span>
            </td>
            <td style="padding:8px 14px;font-size:10px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">${this._escape(route.origin || 'â€”')}</td>
          </tr>`;
        }).join('')}
      </table>` : '<div style="padding:12px 16px;font-size:11px;color:#94a3b8;font-style:italic;">No routes defined.</div>'}
    </div>`;
  }
}

// server main
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server: SocketServer } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const db = require('./cloudnexus_db.cjs');


// â”€â”€â”€ Logger â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level}]: ${message}`)
  ),
  transports: [new winston.transports.Console()],
});

// â”€â”€â”€ App â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const app = express();
const server = http.createServer(app);
const ALLOWED_ORIGINS = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL]
  : ['http://localhost:3006', 'http://localhost:3007', 'http://localhost:3008',
     'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175',
     'http://localhost:3009', 'http://localhost:4173'];

const io = new SocketServer(server, {
  cors: { origin: ALLOWED_ORIGINS, credentials: true },
});

const PORT = process.env.PORT || 3001;

// â”€â”€â”€ Middleware â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(rateLimit({ windowMs: 60000, max: 200, message: 'Too many requests' }));

// â”€â”€â”€ In-memory cache â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ─── Per-org in-memory caches ──────────────────────────────────────────────────────────────────────────────────────────────
const orgCaches = new Map(); // orgAdmin → { aws, gcp, azure, alerts, alertService, topology }

function getOrgCache(orgAdmin) {
  const key = (orgAdmin || '').toLowerCase().trim();
  if (!orgCaches.has(key)) {
    orgCaches.set(key, {
      aws:          { resources: [], lastFetch: null, fetching: false },
      gcp:          { resources: [], lastFetch: null, fetching: false },
      azure:        { resources: [], lastFetch: null, fetching: false },
      alerts:       [],
      alertService: new AlertService(),
      topology:     null,
    });
  }
  return orgCaches.get(key);
}

function resolveOrgAdmin(userEmail) {
  if (!userEmail) return '';
  try { return db.getOrgAdminForUser(userEmail) || ''; } catch { return ''; }
}

const reportService = new ReportService();
reportService.setCache((email) => {
  const orgAdmin = email ? resolveOrgAdmin(email) : '';
  return getOrgCache(orgAdmin);
});
reportService.restoreFromFile();

// â”€â”€â”€ Helper: build topology from resources â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildTopology(orgCache) {
  return {
    aws: orgCache.aws.resources.map(r => ({
      id: r.id, label: r.name, type: r.type, family: r.family,
      provider: 'aws', region: r.region, health: r.health, connections: r.connections,
    })),
    gcp: orgCache.gcp.resources.map(r => ({
      id: r.id, label: r.name, type: r.type, family: r.family,
      provider: 'gcp', region: r.region, health: r.health, connections: r.connections,
    })),
    azure: orgCache.azure.resources.map(r => ({
      id: r.id, label: r.name, type: r.type, family: r.family,
      provider: 'azure', region: r.region, health: r.health, connections: r.connections,
    })),
  };
}

// â”€â”€â”€ Fetch resources for a provider â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function fetchProvider(provider, orgAdmin) {
  const oa = (orgAdmin || '').toLowerCase().trim();
  if (!credentialStore.has(oa, provider)) return;
  const creds = credentialStore.get(oa, provider);
  if (!creds) return;

  const orgCache = getOrgCache(oa);
  const orgRoom  = `org:${oa}`;

  orgCache[provider].fetching = true;
  io.to(orgRoom).emit('provider:fetching', { provider });
  logger.info(`[${oa}] Fetching ${provider} resources...`);

  try {
    let resources = [];
    let providerAlerts = [];

    if (provider === 'aws') {
      const svc = new AWSService(creds);
      resources = await svc.getAllResources();
      providerAlerts = await svc.getAlertsAllRegions();
    } else if (provider === 'gcp') {
      const svc = new GCPService(creds);
      resources = await svc.getAllResources();
      providerAlerts = await svc.getAlerts();
    } else if (provider === 'azure') {
      const svc = new AzureService(creds);
      resources = await svc.getAllResources();
      providerAlerts = await svc.getAlerts();
    }

    orgCache[provider].resources = resources;
    orgCache[provider].lastFetch = new Date().toISOString();
    orgCache[provider].fetching  = false;

    const alertSvc = orgCache.alertService;
    alertSvc.addProviderAlerts(providerAlerts);
    alertSvc.generateFromResources(resources);
    orgCache.alerts   = alertSvc.getAll();
    orgCache.topology = buildTopology(orgCache);

    io.to(orgRoom).emit('provider:updated', {
      provider,
      resources,
      resourceCount: resources.length,
      timestamp: orgCache[provider].lastFetch,
    });
    io.to(orgRoom).emit('alerts:updated', orgCache.alerts);
    io.to(orgRoom).emit('topology:updated', orgCache.topology);

    logger.info(`[${oa}] ${provider}: fetched ${resources.length} resources, ${providerAlerts.length} cloud alerts`);
  } catch (err) {
    orgCache[provider].fetching = false;
    logger.error(`[${oa}] ${provider} fetch error: ${err.message}`);
    io.to(orgRoom).emit('provider:error', { provider, error: err.message });
  }
}

// â”€â”€â”€ Routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


const _path = require('path');

// ─── Proxy /billing/* → billing backend on :8001 ─────────────────────────────
app.all('/billing/*', (req, res) => {
  const targetPath = req.url.replace(/^\/billing/, '') || '/';
  const body = (req.method !== 'GET' && req.body) ? JSON.stringify(req.body) : null;
  const opts = {
    hostname: '127.0.0.1', port: 8001,
    path: targetPath, method: req.method,
    headers: {
      'content-type': 'application/json',
      accept: req.headers.accept || '*/*',
      ...(body ? { 'content-length': Buffer.byteLength(body) } : {}),
    },
  };
  const pr = http.request(opts, (pRes) => {
    res.set(pRes.headers).status(pRes.statusCode);
    pRes.pipe(res, { end: true });
  });
  pr.on('error', () => res.status(502).json({ error: 'Billing backend unavailable' }));
  if (body) pr.write(body);
  pr.end();
});

// ── Auth Routes (website login/register backed by SQLite) ─────────────────
app.post('/auth/register', async (req, res) => {
  const { name, email, password, totpSecret } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
  const result = await db.createUser(name, email, password, totpSecret || null);
  if (result.error) return res.status(400).json(result);
  db.addLog(email, 'register', 'website', null, { name });
  res.json({ success: true });
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
  const user = await db.findUser(email, password);
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });
  if (user.deleted_at) return res.status(401).json({ error: 'Your account has been deleted. Contact your administrator to restore access.' });
  // Successful login clears any stale revocation — re-created users must not be locked out
  revokedSessions.delete(email.toLowerCase().trim());
  persistRevocations();
  const loginTime = new Date().toISOString();
  db.updateLastLogin(email);
  db.addLog(email, 'login', 'website', null, null);
  // Broadcast to admin portals so the Users table refreshes lastLogin instantly
  io.emit('user:login', { email: email.toLowerCase(), loginTime });
  const isAdmin = user.role === 'admin';
  let tools = ['monitoring', 'billing'];
  try { tools = JSON.parse(user.tools || '["monitoring","billing"]'); } catch {}
  res.json({ success: true, user: {
    id: user.id, name: user.name, email: user.email,
    totpSecret: user.totp_secret, mfaEnabled: !!user.mfa_enabled,
    role: user.role || 'user',
    isAdmin,
    tools,
    orgAdmin: user.org_admin || null,  // non-null for promoted sub-admins
  }});
});

app.post('/auth/verify-mfa', (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Missing email' });
  db.markMFAEnabled(email);
  db.updateLastLogin(email);
  db.addLog(email, 'mfa_verified', 'website', null, null);
  res.json({ success: true });
});

app.get('/auth/user/:email', (req, res) => {
  const user = db.getUserByEmail(req.params.email);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({ id: user.id, name: user.name, email: user.email,
             totpSecret: user.totp_secret, mfaEnabled: !!user.mfa_enabled });
});

// Returns org users scoped to admin, or all users if no admin param
app.get('/auth/users', (req, res) => {
  const admin = req.query.admin;
  const users = admin ? db.getOrgUsers(admin) : db.getAllUsers();
  res.json(users.map(u => ({
    id: u.id, name: u.name, email: u.email,
    role: u.role || 'user',
    mfaEnabled: !!u.mfa_enabled, createdAt: u.created_at, lastLogin: u.last_login,
    tools: (() => { try { return JSON.parse(u.tools || '["monitoring","billing"]'); } catch { return ['monitoring','billing']; } })(),
    photo: u.photo || null,
  })));
});

// Soft-delete org user — only if they belong to the calling admin's org
app.delete('/auth/users/:email', (req, res) => {
  const email      = decodeURIComponent(req.params.email);
  const adminEmail = req.query.admin;
  const deletedBy  = req.query.deletedBy || adminEmail;
  if (adminEmail) {
    db.deleteOrgUser(adminEmail, email, deletedBy);
  } else {
    db.deleteUser(email);
  }
  revokedSessions.add(email.toLowerCase().trim());
  persistRevocations();
  io.emit('session:revoked', { email: email.toLowerCase().trim() });
  res.json({ success: true });
});

// Get soft-deleted users still within the 7-day restore window
app.get('/auth/deleted-users', (req, res) => {
  const admin = req.query.admin;
  if (!admin) return res.status(400).json({ error: 'Missing admin param' });
  const users = db.getDeletedOrgUsers(admin);
  res.json(users);
});

// Restore a soft-deleted user so they can log in again
app.post('/auth/restore-user', (req, res) => {
  const { email, adminEmail } = req.body || {};
  if (!email || !adminEmail) return res.status(400).json({ error: 'Missing fields' });
  db.restoreOrgUser(adminEmail, email);
  // Remove from revoked sessions so they can log back in immediately
  revokedSessions.delete(email.toLowerCase().trim());
  persistRevocations();
  db.addLog(email, 'user_restored', 'website', null, { restoredBy: adminEmail }, adminEmail);
  io.emit('admin:updated', { email: adminEmail.toLowerCase(), action: 'user_restored' });
  res.json({ success: true });
});

// Update tool access for an org user
app.put('/auth/users/:email/tools', (req, res) => {
  const email = decodeURIComponent(req.params.email);
  const { tools, admin } = req.body || {};
  if (!admin || !Array.isArray(tools)) return res.status(400).json({ error: 'Missing fields' });
  db.updateUserTools(admin, email, tools);
  // Notify the user in real-time so hub cards update instantly without re-login
  io.emit('tools:updated', { email: email.toLowerCase(), tools });
  res.json({ success: true });
});

// Register with org_admin so the user is scoped to that admin's org
app.post('/auth/register-org-user', async (req, res) => {
  const { name, email, password, orgAdmin, tools } = req.body || {};
  if (!name || !email || !password || !orgAdmin) return res.status(400).json({ error: 'Missing fields' });
  const result = await db.createUser(name, email, password, null, orgAdmin, tools || ['monitoring','billing'], 'user');
  if (result.error) return res.status(400).json(result);
  // Clear any prior revocation so a re-created user can log in
  revokedSessions.delete(email.toLowerCase().trim());
  persistRevocations();
  db.addLog(email, 'user_created', 'website', null, { name, createdBy: orgAdmin }, orgAdmin);
  res.json({ success: true });
});

// Promote an org user to sub-admin (shares org with primary admin)
app.post('/auth/promote-user', (req, res) => {
  const { email, orgAdmin, maxSubAdmins } = req.body || {};
  if (!email || !orgAdmin) return res.status(400).json({ error: 'Missing fields' });
  const dbObj = db.getDB();
  // Count existing sub-admins already promoted in this org (case-insensitive)
  const rows = dbObj.exec(`SELECT COUNT(*) as cnt FROM users WHERE LOWER(org_admin)=LOWER(?) AND role='admin'`, [orgAdmin]);
  const existing = rows[0]?.values[0]?.[0] || 0;
  const limit = maxSubAdmins ?? 1;
  if (limit !== -1 && existing >= limit) {
    return res.status(400).json({ error: `Admin limit reached (max ${limit} co-admin${limit === 1 ? '' : 's'} for this plan)` });
  }
  dbObj.run(`UPDATE users SET role='admin' WHERE LOWER(email)=LOWER(?) AND LOWER(org_admin)=LOWER(?)`, [email, orgAdmin]);
  const _fsSync = require('fs');
  _fsSync.writeFileSync(require('path').join('d:\\','CloudNexus_Website','cloudnexus.db'), Buffer.from(dbObj.export()));
  db.addLog(email, 'promoted_to_co_admin', 'website', null, { promotedBy: orgAdmin }, orgAdmin);
  io.emit('admin:updated', { email: orgAdmin.toLowerCase(), action: 'sub_admin_added' });
  res.json({ success: true });
});

// Demote a sub-admin back to regular user
app.post('/auth/demote-user', (req, res) => {
  const { email, orgAdmin } = req.body || {};
  if (!email || !orgAdmin) return res.status(400).json({ error: 'Missing fields' });
  const dbObj = db.getDB();
  dbObj.run(`UPDATE users SET role='user' WHERE LOWER(email)=LOWER(?) AND LOWER(org_admin)=LOWER(?)`, [email, orgAdmin]);
  const _fsSync = require('fs');
  _fsSync.writeFileSync(require('path').join('d:\\','CloudNexus_Website','cloudnexus.db'), Buffer.from(dbObj.export()));
  db.addLog(email, 'demoted_from_co_admin', 'website', null, { demotedBy: orgAdmin }, orgAdmin);
  io.emit('admin:updated', { email: orgAdmin.toLowerCase(), action: 'sub_admin_removed' });
  res.json({ success: true });
});

// Photo — save and retrieve
app.post('/auth/photo', (req, res) => {
  const { email, photo } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Missing email' });
  db.savePhoto(email, photo || null);
  res.json({ success: true });
});
app.get('/auth/photo/:email', (req, res) => {
  const photo = db.getPhoto(decodeURIComponent(req.params.email));
  res.json({ photo: photo || null });
});

// Subscription plan
app.put('/auth/plan', (req, res) => {
  const { email, plan, purchasedAt } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Missing email' });
  db.updateAdminPlan(email, plan || null, purchasedAt || null);
  db.addLog(email, 'plan_updated', 'website', null, { plan }, email);
  res.json({ success: true });
});

// Admin data (plan + photo)
app.get('/auth/admin-data/:email', (req, res) => {
  const data = db.getAdminData(decodeURIComponent(req.params.email));
  if (!data) return res.status(404).json({ error: 'Not found' });
  res.json({ name: data.name, email: data.email, plan: data.subscription_plan || null, planPurchasedAt: data.plan_purchased_at || null, planPausedAt: data.plan_paused_at || null, photo: data.photo || null });
});

// Bulk-sync localStorage users into DB under the correct admin's org
app.post('/auth/sync-org', async (req, res) => {
  const { adminEmail, users } = req.body || {};
  if (!adminEmail || !Array.isArray(users)) return res.status(400).json({ error: 'Missing adminEmail or users[]' });
  const results = await db.syncOrgUsers(adminEmail, users);
  db.addLog(adminEmail, 'localstorage_sync', 'website', null, results, adminEmail);
  res.json({ success: true, ...results });
});

// ══════════════════════════════════════════════════════════════════════════
// Super Admin Portal — Core5 internal use only
// ══════════════════════════════════════════════════════════════════════════

const SA_EMAIL = 'core5@core5.co.in';
const SA_PASS  = 'Core5@2022';

// ── Super-admin settings (persisted to disk) ─────────────────────────────────
const _saFs   = require('fs');
const _saPath = require('path');
const SA_SETTINGS_PATH = _saPath.join(__dirname, 'superadmin_settings.json');
let saSettings = { uniqueDomains: true };
try { Object.assign(saSettings, JSON.parse(_saFs.readFileSync(SA_SETTINGS_PATH, 'utf8'))); } catch {}
function saveSaSettings() {
  try { _saFs.writeFileSync(SA_SETTINGS_PATH, JSON.stringify(saSettings, null, 2)); } catch {}
}

// Super-admin settings endpoints
app.get('/superadmin/settings', (req, res) => {
  res.json(saSettings);
});
app.put('/superadmin/settings', (req, res) => {
  const patch = req.body || {};
  Object.assign(saSettings, patch);
  saveSaSettings();
  res.json({ success: true, settings: saSettings });
});

app.post('/superadmin/login', (req, res) => {
  const { email, password } = req.body || {};
  if (email === SA_EMAIL && password === SA_PASS) {
    res.json({ success: true, name: 'Core5 Admin' });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// All admins with their org users and current plan
app.get('/superadmin/admins', (req, res) => {
  const orgs = db.getAllOrgs();
  const dbObj = db.getDB();
  const enriched = orgs.map(o => {
    const adminUser = db.getUserByEmail(o.adminEmail);
    // Find promoted sub-admins (users with role='admin' scoped to this org)
    const subAdminRows = dbObj.exec(
      `SELECT id, name, email, created_at, last_login FROM users WHERE org_admin=? AND role='admin'`,
      [o.adminEmail]
    );
    const subAdmins = (subAdminRows[0]?.values || []).map(r => ({
      id: r[0], name: r[1], email: r[2], created_at: r[3], last_login: r[4],
    }));
    return {
      orgName:         o.orgName,
      adminEmail:      o.adminEmail,
      adminName:       adminUser?.name || o.adminEmail,
      adminPhoto:      adminUser?.photo || null,
      plan:            adminUser?.subscription_plan || null,
      planPurchasedAt: adminUser?.plan_purchased_at || null,
      planPausedAt:    adminUser?.plan_paused_at    || null,
      createdAt:       o.createdAt,
      userCount:  o.userCount,
      logCount:   o.logCount,
      subAdmins,
      users:      o.users.map(u => ({
        id:         u.id,
        name:       u.name,
        email:      u.email,
        photo:      u.photo || null,
        created_at: u.created_at,
        last_login: u.last_login,
        tools:      (() => { try { return JSON.parse(u.tools || '["monitoring","billing"]'); } catch { return ['monitoring','billing']; } })(),
      })),
    };
  });
  res.json(enriched);
});

// Create a new admin account and their org
app.post('/superadmin/create-admin', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email and password are required' });

  // Enforce unique domain setting
  const domain = (email.split('@')[1] || '').toLowerCase();
  if (saSettings.uniqueDomains && domain) {
    const dbObj = db.getDB();
    const rows = dbObj.exec(
      `SELECT email FROM users WHERE role='admin' AND org_admin IS NULL AND LOWER(email) LIKE ?`,
      [`%@${domain}`]
    );
    if (rows[0]?.values?.length > 0) {
      return res.status(400).json({ error: `An admin with domain @${domain} already exists. Turn off "Unique Domains" in settings to allow multiple admins per domain.` });
    }
  }

  const result = await db.createUser(name, email, password, null, null, ['monitoring','billing'], 'admin');
  if (result.error) return res.status(400).json({ error: result.error });

  // Create org row — domain = email domain
  const dbObj  = db.getDB();
  try { dbObj.run('INSERT INTO orgs (org_name, admin_email) VALUES (?,?)', [domain, email]); } catch {}

  // Force-persist now (don't wait for debounce)
  const _fs  = require('fs');
  const _p   = require('path');
  _fs.writeFileSync(_p.join('d:\\', 'CloudNexus_Website', 'cloudnexus.db'), Buffer.from(dbObj.export()));

  db.addLog(email, 'admin_account_created', 'website', null, { createdBy: SA_EMAIL }, null);
  io.emit('admin:created', { email: email.toLowerCase(), name });
  res.json({ success: true, email, name });
});

// Cancel an admin's plan entirely
app.delete('/superadmin/admins/:email/plan', (req, res) => {
  const email = decodeURIComponent(req.params.email);
  db.cancelAdminPlan(email);
  const _fs = require('fs'); const _p = require('path');
  _fs.writeFileSync(_p.join('d:\\','CloudNexus_Website','cloudnexus.db'), Buffer.from(db.getDB().export()));
  db.addLog(email, 'plan_cancelled_by_superadmin', 'website', null, null, null);
  io.emit('plan:cancelled', { email: email.toLowerCase() });
  io.emit('admin:updated',  { email: email.toLowerCase(), action: 'plan_cancelled' });
  res.json({ success: true });
});

// Pause an admin's plan (timer freezes)
app.post('/superadmin/admins/:email/plan/pause', (req, res) => {
  const email = decodeURIComponent(req.params.email);
  db.pauseAdminPlan(email);
  const _fs = require('fs'); const _p = require('path');
  _fs.writeFileSync(_p.join('d:\\','CloudNexus_Website','cloudnexus.db'), Buffer.from(db.getDB().export()));
  io.emit('plan:updated', { email: email.toLowerCase(), action: 'paused' });
  io.emit('admin:updated', { email: email.toLowerCase(), action: 'plan_paused' });
  res.json({ success: true });
});

// Resume a paused plan (timer continues, no time lost)
app.post('/superadmin/admins/:email/plan/resume', (req, res) => {
  const email = decodeURIComponent(req.params.email);
  db.resumeAdminPlan(email);
  const _fs = require('fs'); const _p = require('path');
  _fs.writeFileSync(_p.join('d:\\','CloudNexus_Website','cloudnexus.db'), Buffer.from(db.getDB().export()));
  io.emit('plan:updated', { email: email.toLowerCase(), action: 'resumed' });
  io.emit('admin:updated', { email: email.toLowerCase(), action: 'plan_resumed' });
  res.json({ success: true });
});

// Delete an admin and all their users + logs from DB
app.delete('/superadmin/admins/:email', (req, res) => {
  const email  = decodeURIComponent(req.params.email);
  const dbObj  = db.getDB();

  // Delete all org users under this admin
  dbObj.run('DELETE FROM users WHERE org_admin=?', [email]);
  // Delete all logs for this org
  dbObj.run('DELETE FROM logs WHERE org_admin=? OR user_email=?', [email, email]);
  // Delete the org row
  dbObj.run('DELETE FROM orgs WHERE admin_email=?', [email]);
  // Delete the admin user itself
  dbObj.run('DELETE FROM users WHERE email=?', [email]);

  // Revoke any active session
  revokedSessions.add(email.toLowerCase().trim());
  persistRevocations();
  io.emit('session:revoked', { email: email.toLowerCase().trim() });
  io.emit('admin:deleted',   { email: email.toLowerCase().trim() });

  // Force-persist
  const _fs = require('fs');
  const _p  = require('path');
  _fs.writeFileSync(_p.join('d:\\', 'CloudNexus_Website', 'cloudnexus.db'), Buffer.from(dbObj.export()));

  res.json({ success: true });
});

// ── Logs API ──────────────────────────────────────────────────────────────
app.get('/api/logs', (req, res) => {
  const { tool, limit } = req.query;
  res.json(db.getLogs(parseInt(limit) || 200, tool || null));
});

app.post('/api/logs', (req, res) => {
  const { userEmail, action, tool, provider, details } = req.body || {};
  db.addLog(userEmail, action, tool, provider, details);
  res.json({ success: true });
});

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok', providers: credentialStore.listAllOrgProviders() }));

// ── Session Revocation ────────────────────────────────────────────────────────
const _fs = require('fs');
const REVOKE_FILE = _path.join(__dirname, 'revoked_sessions.json');

// Load persisted revocations so backend restarts don't un-revoke deleted accounts
const revokedSessions = new Set();
try {
  const stored = JSON.parse(_fs.readFileSync(REVOKE_FILE, 'utf8'));
  if (Array.isArray(stored)) stored.forEach(e => revokedSessions.add(e));
} catch {}

function persistRevocations() {
  try { _fs.writeFileSync(REVOKE_FILE, JSON.stringify([...revokedSessions]), 'utf8'); } catch {}
}

app.post('/api/revoke-session', (req, res) => {
  const { email } = req.body || {};
  if (email) {
    revokedSessions.add(email.toLowerCase().trim());
    persistRevocations();
    // Instantly push to all connected monitoring clients via WebSocket
    io.emit('session:revoked', { email: email.toLowerCase().trim() });
  }
  res.json({ ok: true });
});

app.get('/api/session-check', (req, res) => {
  const email = (req.query.email || '').toLowerCase().trim();
  if (!email) return res.json({ valid: false });
  // Revoked sessions are always invalid — covers both soft-deleted and hard-deleted users.
  // revokedSessions is cleared on restore or re-creation, so re-created users are not blocked.
  if (revokedSessions.has(email)) return res.json({ valid: false });
  // Not revoked → valid only if the user actually exists and is not soft-deleted
  const user = db.getUserByEmail(email);
  if (!user) return res.json({ valid: false });
  if (user.deleted_at) return res.json({ valid: false });
  res.json({ valid: true });
});

// ── User Activity Log ─────────────────────────────────────────────────────────
const ACTIVITY_LOG_FILE = _path.join(__dirname, 'user_activity_log.json');
let activityLog = {};
try { activityLog = JSON.parse(_fs.readFileSync(ACTIVITY_LOG_FILE, 'utf8')); } catch {}

function persistActivityLog() {
  try { _fs.writeFileSync(ACTIVITY_LOG_FILE, JSON.stringify(activityLog), 'utf8'); } catch {}
}

app.post('/api/activity', (req, res) => {
  const { email, type, details } = req.body || {};
  if (!email || !type) return res.json({ ok: false });
  const key = email.toLowerCase().trim();
  if (!activityLog[key]) activityLog[key] = [];
  activityLog[key].unshift({ type, details: details || {}, ts: new Date().toISOString() });
  if (activityLog[key].length > 500) activityLog[key] = activityLog[key].slice(0, 500);
  persistActivityLog();
  io.emit('activity:new', { email, type, details, ts: Date.now() });
  res.json({ ok: true });
});

app.get('/api/activity/:email', (req, res) => {
  const key = decodeURIComponent(req.params.email || '').toLowerCase().trim();
  res.json({ ok: true, events: activityLog[key] || [] });
});

// â”€â”€ Auth / Connections â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post('/api/connect/:provider', async (req, res) => {
  const { provider } = req.params;
  if (!['aws', 'gcp', 'azure'].includes(provider)) return res.status(400).json({ error: 'Unknown provider' });

  const { uid, ...creds } = req.body || {};
  const orgAdmin = resolveOrgAdmin(uid);
  if (!orgAdmin) return res.status(401).json({ error: 'Missing or invalid uid' });
  if (!Object.keys(creds).length) return res.status(400).json({ error: 'No credentials' });

  try {
    let result;
    if (provider === 'aws') {
      const svc = new AWSService(creds);
      result = await svc.verifyConnection();
    } else if (provider === 'gcp') {
      const svc = new GCPService(creds);
      result = await svc.verifyConnection();
    } else {
      const svc = new AzureService(creds);
      result = await svc.verifyConnection();
    }

    if (!result.success) {
      return res.status(401).json({ success: false, error: result.error });
    }

    credentialStore.set(orgAdmin, provider, creds);
    db.saveCloudSession('monitoring', provider, orgAdmin, creds);
    db.addLog(uid, `connect_${provider}`, 'monitoring', provider, result, orgAdmin);

    fetchProvider(provider, orgAdmin).catch(e => logger.error(`Background fetch error: ${e.message}`));

    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.delete('/api/connect/:provider', (req, res) => {
  const { provider } = req.params;
  const uid      = req.query.uid || (req.body && req.body.uid) || '';
  const orgAdmin = resolveOrgAdmin(uid);
  if (!orgAdmin) return res.status(401).json({ error: 'Missing or invalid uid' });

  credentialStore.delete(orgAdmin, provider);
  db.deleteCloudSession('monitoring', provider, orgAdmin);
  db.addLog(uid, `disconnect_${provider}`, 'monitoring', provider, null, orgAdmin);
  const orgCache = getOrgCache(orgAdmin);
  orgCache[provider]    = { resources: [], lastFetch: null, fetching: false };
  orgCache.alertService = new AlertService();
  orgCache.alerts       = [];
  io.to(`org:${orgAdmin}`).emit('provider:disconnected', { provider });
  res.json({ success: true });
});

app.get('/api/connections', (req, res) => {
  const uid      = req.query.uid || '';
  const orgAdmin = resolveOrgAdmin(uid);
  if (!orgAdmin) return res.json({ aws: { connected: false }, gcp: { connected: false }, azure: { connected: false } });
  const orgCache = getOrgCache(orgAdmin);
  const result = {};
  for (const p of ['aws', 'gcp', 'azure']) {
    result[p] = {
      connected:     credentialStore.has(orgAdmin, p),
      fetching:      orgCache[p]?.fetching || false,
      resourceCount: orgCache[p]?.resources?.length || 0,
      lastFetch:     orgCache[p]?.lastFetch || null,
    };
  }
  res.json(result);
});

// â”€â”€ Resources â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/resources', (req, res) => {
  const { provider, family, region, health, search, uid } = req.query;
  const orgAdmin  = resolveOrgAdmin(uid);
  const orgCache  = getOrgCache(orgAdmin);
  let resources = [];

  if (!provider || provider === 'aws')   resources = resources.concat(orgCache.aws.resources);
  if (!provider || provider === 'gcp')   resources = resources.concat(orgCache.gcp.resources);
  if (!provider || provider === 'azure') resources = resources.concat(orgCache.azure.resources);

  if (family) resources = resources.filter(r => r.family === family);
  if (region) resources = resources.filter(r => r.region?.includes(region));
  if (health) resources = resources.filter(r => r.health === health);
  if (search) {
    const q = search.toLowerCase();
    resources = resources.filter(r =>
      r.name?.toLowerCase().includes(q) ||
      r.type?.toLowerCase().includes(q) ||
      r.region?.toLowerCase().includes(q)
    );
  }

  res.json({ resources, total: resources.length });
});

app.get('/api/resources/:provider', (req, res) => {
  const { provider } = req.params;
  if (!['aws', 'gcp', 'azure'].includes(provider)) return res.status(400).json({ error: 'Unknown provider' });
  const orgAdmin = resolveOrgAdmin(req.query.uid || '');
  const orgCache = getOrgCache(orgAdmin);
  res.json({
    resources: orgCache[provider].resources,
    lastFetch: orgCache[provider].lastFetch,
    fetching: orgCache[provider].fetching,
  });
});

app.post('/api/resources/refresh', async (req, res) => {
  const { provider, uid } = req.body || {};
  const orgAdmin  = resolveOrgAdmin(uid);
  if (!orgAdmin) return res.status(401).json({ error: 'Missing or invalid uid' });
  const providers = provider ? [provider] : credentialStore.listProviders(orgAdmin);
  for (const p of providers) {
    fetchProvider(p, orgAdmin).catch(e => logger.error(`Refresh error: ${e.message}`));
  }
  res.json({ success: true, refreshing: providers });
});

// â”€â”€ Stats / Overview â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/stats', (req, res) => {
  const orgAdmin = resolveOrgAdmin(req.query.uid || '');
  const orgCache = getOrgCache(orgAdmin);
  const all = [...orgCache.aws.resources, ...orgCache.gcp.resources, ...orgCache.azure.resources];
  const totalCost = all.reduce((a, r) => a + (r.cost || 0), 0);
  const regions   = new Set(all.map(r => r.region).filter(Boolean));
  const families  = {};
  for (const r of all) families[r.family] = (families[r.family] || 0) + 1;

  res.json({
    totalServices:    all.length,
    healthyServices:  all.filter(r => r.health === 'healthy').length,
    warningServices:  all.filter(r => r.health === 'warning').length,
    criticalServices: all.filter(r => r.health === 'critical').length,
    totalCostMTD:     Math.round(totalCost),
    regions:          regions.size,
    familyBreakdown:  families,
    perProvider: {
      aws:   { count: orgCache.aws.resources.length,   cost: Math.round(orgCache.aws.resources.reduce((a, r) => a + (r.cost || 0), 0)),   lastFetch: orgCache.aws.lastFetch },
      gcp:   { count: orgCache.gcp.resources.length,   cost: Math.round(orgCache.gcp.resources.reduce((a, r) => a + (r.cost || 0), 0)),   lastFetch: orgCache.gcp.lastFetch },
      azure: { count: orgCache.azure.resources.length, cost: Math.round(orgCache.azure.resources.reduce((a, r) => a + (r.cost || 0), 0)), lastFetch: orgCache.azure.lastFetch },
    },
  });
});

app.get('/api/alerts', (req, res) => {
  const orgAdmin = resolveOrgAdmin(req.query.uid || '');
  const orgCache = getOrgCache(orgAdmin);
  res.json({ alerts: orgCache.alerts, stats: orgCache.alertService.getStats() });
});

app.post('/api/alerts/:id/acknowledge', (req, res) => {
  const { id }   = req.params;
  const orgAdmin = resolveOrgAdmin(req.body?.uid || req.query.uid || '');
  const orgCache = getOrgCache(orgAdmin);
  const ok = orgCache.alertService.acknowledge(id);
  orgCache.alerts = orgCache.alertService.getAll();
  io.to(`org:${orgAdmin}`).emit('alerts:updated', orgCache.alerts);
  res.json({ success: ok });
});

app.post('/api/alerts/acknowledge-all', (req, res) => {
  const orgAdmin = resolveOrgAdmin(req.body?.uid || req.query.uid || '');
  const orgCache = getOrgCache(orgAdmin);
  for (const a of orgCache.alertService.getAll()) orgCache.alertService.acknowledge(a.id);
  orgCache.alerts = orgCache.alertService.getAll();
  io.to(`org:${orgAdmin}`).emit('alerts:updated', orgCache.alerts);
  res.json({ success: true });
});

// â”€â”€ Daily Reports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/reports/schedule', (req, res) => {
  const { email } = req.query;
  if (email) {
    const schedule = reportService.getSchedule(email);
    return res.json({ schedule });
  }
  res.json({ schedules: reportService.getAllSchedules() });
});

app.post('/api/reports/schedule', (req, res) => {
  const { email, time } = req.body;
  if (!email || !time) return res.status(400).json({ error: 'email and time are required' });
  if (!/^\d{2}:\d{2}$/.test(time)) return res.status(400).json({ error: 'time must be HH:MM format' });
  reportService.schedule(email, time);
  logger.info(`Daily report scheduled for ${email} at ${time}`);
  res.json({ success: true, email, time });
});

app.delete('/api/reports/schedule', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required' });
  const removed = reportService.unschedule(email);
  res.json({ success: removed });
});

app.post('/api/reports/send-now', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required' });
  try {
    await reportService.sendReport(email);
    logger.info(`Daily report sent immediately to ${email}`);
    res.json({ success: true });
  } catch (e) {
    logger.error(`Report send error: ${e.message}`);
    let userMessage = e.message;
    if (e.responseCode === 535 || e.message.includes('535') || e.message.includes('Authentication Failed')) {
      userMessage = 'ZOHO_AUTH_FAILED';
    }
    res.status(500).json({ error: userMessage });
  }
});

// â”€â”€ Network Topology â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/topology', (req, res) => {
  const orgAdmin = resolveOrgAdmin(req.query.uid || '');
  const orgCache = getOrgCache(orgAdmin);
  if (!orgCache.topology) orgCache.topology = buildTopology(orgCache);
  res.json(orgCache.topology);
});

app.get('/api/metrics/resource/:id', (req, res) => {
  const { id }   = req.params;
  const orgAdmin = resolveOrgAdmin(req.query.uid || '');
  const orgCache = getOrgCache(orgAdmin);
  const all = [...orgCache.aws.resources, ...orgCache.gcp.resources, ...orgCache.azure.resources];
  const resource = all.find(r => r.id === id);
  if (!resource) return res.status(404).json({ error: 'Resource not found' });

  // Return time-series style metrics (mocked if not real)
  const now = Date.now();
  const points = Array.from({ length: 60 }, (_, i) => ({
    timestamp: new Date(now - (59 - i) * 60000).toISOString(),
    cpu: resource.cpu ? Math.max(0, Math.min(100, resource.cpu + (Math.random() - 0.5) * 10)) : null,
    memory: resource.memUsage ? Math.max(0, Math.min(100, resource.memUsage + (Math.random() - 0.5) * 8)) : null,
    networkIn: resource.networkIn || Math.round(100 + Math.random() * 500),
    networkOut: resource.networkOut || Math.round(50 + Math.random() * 200),
  }));

  res.json({ resourceId: id, metrics: points });
});

// â”€â”€ CWAgent Installation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function getAWSSvc(orgAdmin) {
  const creds = credentialStore.get(orgAdmin || '', 'aws');
  if (!creds) return null;
  return new AWSService(creds);
}

app.get('/api/aws/s3-details/:bucket', async (req, res) => {
  const orgAdmin = resolveOrgAdmin(req.query.uid || '');
  const svc = getAWSSvc(orgAdmin);
  if (!svc) return res.status(400).json({ error: 'AWS not connected' });
  try {
    const details = await svc.getS3BucketDetails(req.params.bucket);
    res.json(details);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/aws/install-cwagent', async (req, res) => {
  const { instanceId, region, uid } = req.body;
  if (!instanceId || !region) return res.status(400).json({ error: 'instanceId and region required' });
  const orgAdmin = resolveOrgAdmin(uid || '');
  const svc = getAWSSvc(orgAdmin);
  if (!svc) return res.status(400).json({ error: 'AWS not connected' });
  try {
    const commandId = await svc.installCWAgent(instanceId, region);
    res.json({ commandId, phase: 'installing' });
  } catch (e) {
    logger.error(`install-cwagent error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/aws/configure-cwagent', async (req, res) => {
  const { instanceId, region, platform } = req.body;
  if (!instanceId || !region) return res.status(400).json({ error: 'instanceId and region required' });
  const svc = getAWSSvc();
  if (!svc) return res.status(400).json({ error: 'AWS not connected' });
  try {
    const commandId = await svc.configureCWAgent(instanceId, region, platform);
    res.json({ commandId, phase: 'configuring' });
  } catch (e) {
    logger.error(`configure-cwagent error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/aws/cwagent-status', async (req, res) => {
  const { commandId, instanceId, region } = req.query;
  if (!commandId || !instanceId || !region) return res.status(400).json({ error: 'commandId, instanceId and region required' });
  const svc = getAWSSvc();
  if (!svc) return res.status(400).json({ error: 'AWS not connected' });
  try {
    const result = await svc.getCWAgentCommandStatus(commandId, instanceId, region);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ── Contact Form ──────────────────────────────────────────────────────────────
app.post('/api/contact', async (req, res) => {
  const { name, phone, company, email, plan, message } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'name and email are required' });

  function row(label, val, color) {
    if (!val) return '';
    const c = color || '#1e293b';
    return '<tr>'
      + '<td style="padding:6px 0;font-size:13px;color:#94a3b8;width:110px;vertical-align:top;">' + label + '</td>'
      + '<td style="padding:6px 0;font-size:13px;color:' + c + ';font-weight:600;">' + val + '</td>'
      + '</tr>';
  }
  const detailRows = [
    row('Company', company),
    row('Plan', plan, '#2563eb'),
    row('Phone', phone),
    row('Email', email),
    message ? '<tr><td style="padding:6px 0;font-size:13px;color:#94a3b8;vertical-align:top;">Message</td><td style="padding:6px 0;font-size:13px;color:#1e293b;">' + message + '</td></tr>' : '',
  ].filter(Boolean).join('');

  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
    + '<body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:48px 16px;">'
    + '<tr><td align="center">'
    + '<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">'

    // Header
    + '<tr><td style="background:#07111f;border-radius:16px 16px 0 0;padding:36px 40px;text-align:center;">'
    + '<table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>'
    + '<td style="background:#2563eb;border-radius:8px;width:34px;height:34px;text-align:center;vertical-align:middle;"><span style="color:#fff;font-size:16px;font-weight:900;">C</span></td>'
    + '<td style="padding-left:10px;font-size:21px;font-weight:800;color:#fff;letter-spacing:-0.5px;vertical-align:middle;">Cloud<span style="color:#60a5fa;">Nexus</span></td>'
    + '</tr></table></td></tr>'

    // Green confirmation banner
    + '<tr><td style="background:#16a34a;padding:14px 40px;text-align:center;">'
    + '<span style="font-size:14px;font-weight:700;color:#fff;">&#10003; &nbsp; Request Successfully Received</span>'
    + '</td></tr>'

    // Body
    + '<tr><td style="background:#ffffff;padding:40px 40px 32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">'
    + '<h1 style="font-size:22px;font-weight:800;color:#0f172a;margin:0 0 10px;letter-spacing:-0.4px;">Hi ' + name + ', we got your message!</h1>'
    + '<p style="font-size:14px;color:#475569;margin:0 0 28px;line-height:1.75;">Thank you for reaching out to <strong>CloudNexus</strong>. Our team has received your request and will connect with you within <strong>24 business hours</strong>.</p>'

    // Details card
    + '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px 24px;margin-bottom:32px;">'
    + '<p style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin:0 0 14px;">Your Submission Details</p>'
    + '<table cellpadding="0" cellspacing="0" style="width:100%;">' + detailRows + '</table>'
    + '</div>'

    // What next
    + '<p style="font-size:14px;font-weight:700;color:#0f172a;margin:0 0 14px;">What happens next?</p>'
    + '<table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:32px;">'
    + '<tr><td style="vertical-align:top;padding:0 12px 14px 0;width:28px;"><div style="background:#eff6ff;color:#2563eb;border-radius:50%;width:24px;height:24px;text-align:center;line-height:24px;font-size:11px;font-weight:800;">1</div></td><td style="font-size:13px;color:#475569;line-height:1.65;padding-bottom:14px;">Our team reviews your request and prepares a tailored demo.</td></tr>'
    + '<tr><td style="vertical-align:top;padding:0 12px 14px 0;"><div style="background:#eff6ff;color:#2563eb;border-radius:50%;width:24px;height:24px;text-align:center;line-height:24px;font-size:11px;font-weight:800;">2</div></td><td style="font-size:13px;color:#475569;line-height:1.65;padding-bottom:14px;">A CloudNexus specialist will reach out to schedule a <strong>personalized walkthrough</strong>.</td></tr>'
    + '<tr><td style="vertical-align:top;padding:0 12px 0 0;"><div style="background:#eff6ff;color:#2563eb;border-radius:50%;width:24px;height:24px;text-align:center;line-height:24px;font-size:11px;font-weight:800;">3</div></td><td style="font-size:13px;color:#475569;line-height:1.65;">We will customize the session around your <strong>infrastructure and cost goals</strong>.</td></tr>'
    + '</table>'
    + '<div style="text-align:center;"><a href="http://localhost:3006" style="display:inline-block;background:#2563eb;color:#fff;font-size:14px;font-weight:700;padding:14px 36px;border-radius:10px;text-decoration:none;">Explore CloudNexus</a></div>'
    + '</td></tr>'

    // Footer
    + '<tr><td style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center;">'
    + '<p style="font-size:12px;color:#94a3b8;margin:0 0 4px;">&copy; 2026 CloudNexus. All rights reserved.</p>'
    + '<p style="font-size:12px;color:#cbd5e1;margin:0;">You received this because you submitted a demo request on CloudNexus.</p>'
    + '</td></tr>'

    + '</table></td></tr></table></body></html>';

  const submittedAt = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
  const internalHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"></head>'
      + '<body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;">'
      + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:48px 16px;">'
      + '<tr><td align="center">'
      + '<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">'

      // Header
      + '<tr><td style="background:#07111f;border-radius:16px 16px 0 0;padding:28px 40px;text-align:center;">'
      + '<table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>'
      + '<td style="background:#2563eb;border-radius:8px;width:34px;height:34px;text-align:center;vertical-align:middle;"><span style="color:#fff;font-size:16px;font-weight:900;">C</span></td>'
      + '<td style="padding-left:10px;font-size:21px;font-weight:800;color:#fff;letter-spacing:-0.5px;vertical-align:middle;">Cloud<span style="color:#60a5fa;">Nexus</span></td>'
      + '</tr></table>'
      + '<p style="margin:12px 0 0;font-size:12px;color:rgba(255,255,255,0.5);letter-spacing:0.5px;text-transform:uppercase;">New Lead / Contact Request</p>'
      + '</td></tr>'

      // Orange banner
      + '<tr><td style="background:#d97706;padding:12px 40px;text-align:center;">'
      + '<span style="font-size:13px;font-weight:700;color:#fff;">&#128276; &nbsp; New enquiry submitted — ' + submittedAt + ' IST</span>'
      + '</td></tr>'

      // Body
      + '<tr><td style="background:#ffffff;padding:36px 40px 32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">'
      + '<h2 style="font-size:18px;font-weight:800;color:#0f172a;margin:0 0 6px;">Lead Details</h2>'
      + '<p style="font-size:13px;color:#64748b;margin:0 0 24px;">A visitor has submitted the Contact Us form on the CloudNexus website.</p>'

      // Details table
      + '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px 24px;margin-bottom:24px;">'
      + '<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">'
      + '<tr><td style="padding:8px 0;font-size:12px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;width:120px;border-bottom:1px solid #f1f5f9;">Name</td><td style="padding:8px 0;font-size:14px;color:#0f172a;font-weight:700;border-bottom:1px solid #f1f5f9;">' + name + '</td></tr>'
      + '<tr><td style="padding:8px 0;font-size:12px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;border-bottom:1px solid #f1f5f9;">Email</td><td style="padding:8px 0;font-size:14px;font-weight:600;border-bottom:1px solid #f1f5f9;"><a href="mailto:' + email + '" style="color:#2563eb;text-decoration:none;">' + email + '</a></td></tr>'
      + (phone ? '<tr><td style="padding:8px 0;font-size:12px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;border-bottom:1px solid #f1f5f9;">Phone</td><td style="padding:8px 0;font-size:14px;color:#0f172a;font-weight:600;border-bottom:1px solid #f1f5f9;">' + phone + '</td></tr>' : '')
      + (company ? '<tr><td style="padding:8px 0;font-size:12px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;border-bottom:1px solid #f1f5f9;">Company</td><td style="padding:8px 0;font-size:14px;color:#0f172a;font-weight:600;border-bottom:1px solid #f1f5f9;">' + company + '</td></tr>' : '')
      + (plan ? '<tr><td style="padding:8px 0;font-size:12px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;border-bottom:1px solid #f1f5f9;">Plan</td><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;"><span style="display:inline-block;background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;padding:3px 12px;border-radius:999px;font-size:13px;font-weight:700;">' + plan + '</span></td></tr>' : '')
      + (message ? '<tr><td style="padding:8px 0;font-size:12px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;vertical-align:top;">Message</td><td style="padding:8px 0;font-size:14px;color:#334155;line-height:1.65;">' + message + '</td></tr>' : '')
      + '</table>'
      + '</div>'

      + '<p style="font-size:12px;color:#94a3b8;margin:0;">Reply directly to this email or contact the lead at <a href="mailto:' + email + '" style="color:#2563eb;">' + email + '</a>.</p>'
      + '</td></tr>'

      // Footer
      + '<tr><td style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;padding:16px 40px;text-align:center;">'
      + '<p style="font-size:12px;color:#94a3b8;margin:0;">CloudNexus Admin Notification &mdash; ' + submittedAt + ' IST</p>'
      + '</td></tr>'

      + '</table></td></tr></table></body></html>';

  try {
    await reportService.transporter.sendMail({
      from: SMTP_FROM,
      to: email,
      subject: "CloudNexus — We've received your request, " + name + "!",
      html,
    });
    logger.info("Contact confirmation sent to " + email);

    // Append to OneDrive Excel — runs in background, never blocks the response
    appendToOneDriveExcel({ name, phone, company, email, plan, message })
      .catch(err => logger.error('[OneDrive] Excel append failed: ' + err.message));

    res.json({ ok: true });
  } catch (err) {
    logger.error("Contact email failed: " + err.message);
    res.status(500).json({ error: 'Failed to send email', details: err.message });
  }

  // Admin lead notification — isolated so it never affects the client-facing response
  try {
    await reportService.transporter.sendMail({
      from: SMTP_FROM,
      to: 'aniket.singh@core5.co.in',
      replyTo: email,
      subject: '[CloudNexus Lead] ' + name + (company ? ' (' + company + ')' : '') + (plan ? ' - ' + plan : ''),
      html: internalHtml,
    });
    logger.info("Internal lead notification sent to aniket.singh@core5.co.in for enquiry from " + email);
  } catch (adminErr) {
    logger.error("Admin lead notification FAILED: " + adminErr.message);
  }
});


// ── Razorpay: Create Order ────────────────────────────────────────────────────
app.post('/api/create-order', async (req, res) => {
  const { amount, currency = 'INR', receipt, plan_name } = req.body || {};
  if (!amount || Number(amount) < 100) {
    return res.status(400).json({ error: 'amount must be at least 100 paise (₹1)' });
  }
  try {
    const order = await razorpay.orders.create({
      amount:   Number(amount),
      currency,
      receipt:  receipt || `rcpt_${Date.now()}`,
      notes:    { plan_name: plan_name || '' },
    });
    logger.info(`[Razorpay] Order created: ${order.id} for ${plan_name} ₹${amount / 100}`);
    res.json({ order_id: order.id, amount: order.amount, currency: order.currency });
  } catch (err) {
    logger.error('[Razorpay] create-order failed: ' + err.message);
    res.status(500).json({ error: 'Failed to create Razorpay order', details: err.message });
  }
});

// ── Razorpay: Verify Payment Signature ───────────────────────────────────────
app.post('/api/verify-payment', (req, res) => {
  const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body || {};
  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment fields' });
  }
  const expected = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');
  if (expected !== razorpay_signature) {
    logger.warn(`[Razorpay] Signature mismatch for order ${razorpay_order_id}`);
    return res.status(400).json({ error: 'Signature mismatch — payment not verified' });
  }
  logger.info(`[Razorpay] Payment verified: ${razorpay_payment_id}`);
  res.json({ ok: true, payment_id: razorpay_payment_id });
});


// â”€â”€â”€ WebSocket â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const onlineUsers = new Map(); // email -> { name, socketId, loginTime }

io.on('connection', socket => {
  logger.info(`Client connected: ${socket.id}`);

  // Resolve org from uid in socket query and join org room
  const socketUid = (socket.handshake.query.uid || '').toLowerCase().trim();
  const socketOrg = socketUid ? resolveOrgAdmin(socketUid) : '';
  socket.data.orgAdmin = socketOrg;
  if (socketOrg) socket.join(`org:${socketOrg}`);

  // Send org-scoped initial state
  const initCache = getOrgCache(socketOrg);
  socket.emit('initial:state', {
    aws:      { resources: initCache.aws.resources,   lastFetch: initCache.aws.lastFetch,   fetching: initCache.aws.fetching },
    gcp:      { resources: initCache.gcp.resources,   lastFetch: initCache.gcp.lastFetch,   fetching: initCache.gcp.fetching },
    azure:    { resources: initCache.azure.resources, lastFetch: initCache.azure.lastFetch, fetching: initCache.azure.fetching },
    alerts:   initCache.alerts,
    topology: initCache.topology || buildTopology(initCache),
    connections: {
      aws:   { connected: credentialStore.has(socketOrg, 'aws'),   resourceCount: initCache.aws.resources.length },
      gcp:   { connected: credentialStore.has(socketOrg, 'gcp'),   resourceCount: initCache.gcp.resources.length },
      azure: { connected: credentialStore.has(socketOrg, 'azure'), resourceCount: initCache.azure.resources.length },
    },
  });

  socket.on('refresh', ({ provider }) => {
    const oa = socket.data.orgAdmin || '';
    if (provider && ['aws', 'gcp', 'azure'].includes(provider)) {
      fetchProvider(provider, oa).catch(e => logger.error(e.message));
    } else {
      credentialStore.listProviders(oa).forEach(p =>
        fetchProvider(p, oa).catch(e => logger.error(e.message))
      );
    }
  });

  socket.on('acknowledge', ({ alertId }) => {
    const oa       = socket.data.orgAdmin || '';
    const orgCache = getOrgCache(oa);
    orgCache.alertService.acknowledge(alertId);
    orgCache.alerts = orgCache.alertService.getAll();
    io.to(`org:${oa}`).emit('alerts:updated', orgCache.alerts);
  });

  socket.on('disconnect', () => {
    for (const [email, data] of onlineUsers.entries()) {
      if (data.socketId === socket.id) { onlineUsers.delete(email); break; }
    }
    io.emit('users:online', [...onlineUsers.entries()].map(([e, d]) => ({ email: e, name: d.name, loginTime: d.loginTime })));
    logger.info(`Client disconnected: ${socket.id}`);
  });

  socket.on('user:online', ({ email, name }) => {
    if (!email) return;
    onlineUsers.set(email.toLowerCase(), { name: name || email, socketId: socket.id, loginTime: Date.now() });
    io.emit('users:online', [...onlineUsers.entries()].map(([e, d]) => ({ email: e, name: d.name, loginTime: d.loginTime })));
  });

  socket.on('user:offline', ({ email }) => {
    if (email) onlineUsers.delete(email.toLowerCase());
    io.emit('users:online', [...onlineUsers.entries()].map(([e, d]) => ({ email: e, name: d.name, loginTime: d.loginTime })));
  });

});

// â”€â”€â”€ Cron: auto-refresh every 5 minutes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
cron.schedule('*/5 * * * *', () => {
  const allConnected = credentialStore.listAllOrgProviders();
  if (allConnected.length > 0) {
    logger.info(`Cron refresh: ${allConnected.map(x => `${x.orgAdmin}/${x.provider}`).join(', ')}`);
    allConnected.forEach(({ orgAdmin, provider }) =>
      fetchProvider(provider, orgAdmin).catch(e => logger.error(e.message))
    );
  }
});

// â”€â”€â”€ Start â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ── Start with DB init + session restore ─────────────────────────────────
db.initDB().then(() => {
  // Purge users whose 7-day restore window has expired
  db.purgeExpiredDeletedUsers();
  // Schedule daily purge at midnight
  cron.schedule('0 0 * * *', () => db.purgeExpiredDeletedUsers(), { timezone: 'Asia/Kolkata' });

  // Restore persisted monitoring sessions (up to 48h) — scoped per org
  const sessions = db.loadAllCloudSessions('monitoring');
  for (const s of sessions) {
    if (s.credentials) {
      const oa = (s.org_admin || '').trim();
      credentialStore.set(oa, s.provider, s.credentials);
      logger.info(`Restored [${oa}] ${s.provider} session from DB (expires ${s.expires_at})`);
      fetchProvider(s.provider, oa).catch(e => logger.error(`Session restore fetch: ${e.message}`));
    }
  }
  server.listen(PORT, () => {
    logger.info(`CloudNexus backend running on http://localhost:${PORT}`);
  });
}).catch(err => {
  logger.error('DB init failed, starting without DB: ' + err.message);
  server.listen(PORT, () => {
    logger.info(`CloudNexus backend running on http://localhost:${PORT} (no DB)`);
  });
});


