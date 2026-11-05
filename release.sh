#!/usr/bin/env bash

cd /home/plex/Desktop/v6/ || exit 1

CUSTOM_VERSION=""

# Parse -r flag for custom version overrides
while getopts "r:" opt; do
  case $opt in
    r) CUSTOM_VERSION="$OPTARG" ;;
    \?) echo "❌ Invalid option -$OPTARG" >&2; exit 1 ;;
  esac
done

if [ ! -f "metadata.json" ]; then
  echo "❌ Error: metadata.json not found in /home/plex/Desktop/v6/"
  exit 1
fi

if ! command -v jq &> /dev/null; then
  echo "❌ Error: jq is missing. Install with: sudo pacman -S jq"
  exit 1
fi

CURRENT_VERSION=$(jq -r '.version // empty' metadata.json)

if [ -z "$CURRENT_VERSION" ]; then
  echo "❌ Error: Could not parse .version from metadata.json"
  exit 1
fi

if [ -n "$CUSTOM_VERSION" ]; then
  NEW_VERSION="$CUSTOM_VERSION"
  echo "🚀 Using custom version: $NEW_VERSION"
else
  PREFIX=$(echo "$CURRENT_VERSION" | awk -F'-r' '{print $1}')
  REVISION=$(echo "$CURRENT_VERSION" | awk -F'-r' '{print $2}')
  if ! [[ "$REVISION" =~ ^[0-9]+$ ]]; then 
    REVISION=0
  fi
  NEW_REVISION=$((REVISION + 1))
  NEW_VERSION="${PREFIX}-r${NEW_REVISION}"
  echo "🚀 Bumping version: $CURRENT_VERSION -> $NEW_VERSION"
fi

# 1. Update metadata.json
jq --arg v "$NEW_VERSION" '.version = $v' metadata.json > tmp.json && mv tmp.json metadata.json

# 2. Stage and commit changes
echo "📦 Committing changes..."
git add .
git commit -m "chore: release $NEW_VERSION"

# 3. Force push main branch to remote
echo "⬆️ Pushing main branch to GitHub..."
git push -f origin main

# 4. Tag and force push release tag
echo "🏷️ Pushing release tag $NEW_VERSION..."
git tag -d "$NEW_VERSION" 2>/dev/null
git tag "$NEW_VERSION"
git push -f origin "$NEW_VERSION"

echo "✅ Done! Release $NEW_VERSION pushed to 24xl/v6."
