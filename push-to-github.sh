#!/bin/bash
# Run this from inside the si-trading folder:
# chmod +x push-to-github.sh && ./push-to-github.sh

echo "Setting git config..."
git config user.email "saveezirfan0@gmail.com"
git config user.name "saveezirfan0-cloud"

echo "Initializing git..."
git init
git remote remove origin 2>/dev/null
git remote add origin https://github.com/saveezirfan0-cloud/si-trading-erp.git

echo "Staging all files..."
git add .

echo "Committing..."
git commit -m "Complete ERP — Sales/Purchase invoices, brands, charts, font fix"

echo "Pushing to main..."
git branch -M main
git push --force origin main

echo ""
echo "Done! Check https://si-trading-erp.vercel.app in ~2 minutes"
