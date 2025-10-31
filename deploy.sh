#!/bin/bash

# Zero@Design Deploy Script
# Deploys to AWS EC2 instance

set -e  # Exit on error

# Configuration
EC2_IP="3.150.78.181"
EC2_USER="ubuntu"
SSH_KEY="$HOME/.ssh/zeroatproject-ec2.pem"
REMOTE_PATH="/home/ubuntu/zero_project/"
LOCAL_PATH="/Users/cemonat/Desktop/ZeroAtDesign_Project/zero_project/"

echo "=========================================="
echo "Zero@Design Deployment"
echo "=========================================="
echo "Target: ${EC2_USER}@${EC2_IP}:${REMOTE_PATH}"
echo "Source: ${LOCAL_PATH}"
echo ""

# Check if SSH key exists
if [ ! -f "${SSH_KEY}" ]; then
    echo "❌ SSH key not found: ${SSH_KEY}"
    exit 1
fi

# Check if SSH key is accessible
if ! ssh -i ${SSH_KEY} -o BatchMode=yes -o ConnectTimeout=5 ${EC2_USER}@${EC2_IP} echo "SSH OK" 2>/dev/null; then
    echo "❌ SSH connection failed. Check your SSH key and EC2 instance."
    exit 1
fi

echo "✓ SSH connection verified"
echo ""

# Rsync with options
echo "Starting deployment..."
rsync -avz \
    -e "ssh -i ${SSH_KEY}" \
    --delete \
    --exclude '.DS_Store' \
    --exclude '.git' \
    --exclude '*.sh' \
    --exclude 'deploy.sh' \
    --exclude 'node_modules' \
    --exclude '.venv' \
    --progress \
    ${LOCAL_PATH} \
    ${EC2_USER}@${EC2_IP}:${REMOTE_PATH}

echo ""
echo "=========================================="
echo "✓ Deployment completed successfully!"
echo "=========================================="
echo "Site: https://app.onatltd.com"
echo ""

# Optional: Restart nginx if needed
read -p "Restart nginx container? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Restarting nginx..."
    ssh -i ${SSH_KEY} ${EC2_USER}@${EC2_IP} "docker restart zero_design_nginx_prod"
    echo "✓ Nginx restarted"
fi
