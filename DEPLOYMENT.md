# S3 Deployment Guide

This guide will help you deploy the CC Validation Automation application to AWS S3.

## Prerequisites

- AWS Account with S3 access
- AWS CLI configured (optional, for easier deployment)
- Node.js and npm installed

## Build Configuration

### Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# OCR API Configuration
# Set the base URL for the OCR API service
VITE_OCR_BASE_URL=https://gb-ocr-stage.vertekx.com

# Base Path Configuration (for S3 subdirectory deployment)
# Leave empty or set to '/' for root deployment
# Set to '/subdirectory/' for subdirectory deployment (include trailing slash)
VITE_BASE_PATH=/
```

### For Root Domain Deployment

If deploying to the root of your S3 bucket (e.g., `https://your-bucket.s3.amazonaws.com/`):

```env
VITE_BASE_PATH=/
```

### For Subdirectory Deployment

If deploying to a subdirectory (e.g., `https://your-bucket.s3.amazonaws.com/app/`):

```env
VITE_BASE_PATH=/app/
```

## Build Steps

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build for production:**
   ```bash
   npm run build
   ```

   This will create a `dist` folder with all the production files.

3. **Upload to S3:**
   
   **Option A: Using AWS Console**
   - Go to your S3 bucket
   - Upload all files from the `dist` folder
   - Make sure to preserve folder structure
   - Set proper permissions (public read for static files)

   **Option B: Using AWS CLI**
   ```bash
   aws s3 sync dist/ s3://your-bucket-name/ --delete
   ```

4. **Configure S3 Bucket for Static Website Hosting:**
   - Go to S3 bucket properties
   - Enable "Static website hosting"
   - Set index document to `index.html`
   - Set error document to `index.html` (for React Router to work)

5. **Configure Error Handling (Important for React Router):**
   - In S3 bucket properties → Static website hosting
   - Set "Error document" to `index.html`
   - This ensures that all routes are handled by React Router

## Important Notes

### API Configuration

The OCR API URL is now configurable via the `VITE_OCR_BASE_URL` environment variable. Make sure to set this before building if you need to use a different API endpoint.

### Base Path

If you're deploying to a subdirectory, make sure to:
1. Set `VITE_BASE_PATH` in your `.env` file before building
2. Configure your S3 bucket path accordingly
3. The router will automatically handle the base path

### CORS Configuration

If your OCR API is on a different domain, ensure CORS is properly configured on the API server to allow requests from your S3 bucket domain.

## Troubleshooting

### Routes Not Working

If routes (like `/redaction`) return 404:
- Make sure you've set the error document to `index.html` in S3 static website hosting settings
- Verify that `VITE_BASE_PATH` matches your deployment path

### API Calls Failing

- Check that `VITE_OCR_BASE_URL` is correctly set
- Verify CORS settings on the API server
- Check browser console for specific error messages

### Assets Not Loading

- Ensure all files from `dist` folder are uploaded
- Check that file paths are relative (they should be after build)
- Verify S3 bucket permissions allow public read access

