# CloudNexus Website

A modern cloud infrastructure management dashboard built with React, featuring real-time analytics, cost optimization, and multi-cloud support.

## Features

- 📊 **Real-Time Insights** - Monitor infrastructure usage and performance with live telemetry
- 💸 **Cost Optimization** - Identify waste automatically and surface actionable recommendations
- ☁️ **Multi-Cloud Support** - Unified control plane for AWS, Azure, and GCP
- 🔒 **Built-In Security** - Enterprise-grade encryption and access controls
- 🔮 **Usage Forecasting** - ML-powered predictions for demand planning
- ⚡ **Automatic Scaling** - Elastic infrastructure that responds to demand spikes

## Setup Instructions

### Prerequisites
- Node.js 18+ and npm

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up EmailJS (for OTP authentication):**
   - Go to [EmailJS](https://www.emailjs.com/)
   - Create a free account and set up an email service
   - Copy your Service ID, Template ID, and Public Key
   - Update `src/App.jsx` lines 6-8 with your credentials:
     ```javascript
     const EMAILJS_SERVICE_ID  = "your_service_id";
     const EMAILJS_TEMPLATE_ID = "your_template_id";
     const EMAILJS_PUBLIC_KEY  = "your_public_key";
     ```

### Development

Start the development server:
```bash
npm run dev
```

The app will open at `http://localhost:5173`

### Building

Build for production:
```bash
npm run build
```

Preview production build:
```bash
npm run preview
```

## Project Structure

```
CloudNexus_Website/
├── src/
│   ├── App.jsx          # Main application component
│   └── main.jsx         # React entry point
├── index.html           # HTML template
├── vite.config.js       # Vite configuration
├── package.json         # Dependencies and scripts
└── README.md            # This file
```

## Authentication Flow

1. User enters credentials on the sign-in or registration page
2. System validates credentials against localStorage
3. OTP is generated and sent via EmailJS
4. User verifies OTP within 60 seconds
5. User session is stored in localStorage
6. Dashboard becomes accessible

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## License

MIT

## Support

For issues or questions, please refer to the documentation or create an issue in the repository.
