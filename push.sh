#!/bin/bash
# Run this script from inside the si-trading folder
# Usage: bash push.sh

echo "Setting up git..."
git init
git config user.email "saveezirfan0@gmail.com"
git config user.name "saveezirfan0-cloud"

echo "Connecting to GitHub..."
git remote remove origin 2>/dev/null
git remote add origin https://saveezirfan0-cloud@github.com/saveezirfan0-cloud/si-trading-erp.git

echo "Staging all files..."
git add .

echo "Committing..."
git commit -m "Complete ERP v3 — Sales/Purchase Invoices, Brands, Inter font, fixed layout"

echo "Pushing to main..."
git branch -M main
git push --force origin main

echo ""
echo "Done! Check vercel.com for auto-deploy."
