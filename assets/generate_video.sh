#!/bin/bash
# Shellcorp Launch Video Generator
# Run this script when your Replicate API has credit

set -e

API_KEY="${REPLICATE_API_TOKEN:-YOUR_API_KEY_HERE}"
OUTPUT_DIR="$(dirname "$0")"

if [ "$API_KEY" = "YOUR_API_KEY_HERE" ]; then
    echo "Error: Set REPLICATE_API_TOKEN environment variable or edit this script"
    exit 1
fi

echo "🦞 Shellcorp Launch Video Generator"
echo "====================================="

# Function to wait for prediction and get output
wait_for_prediction() {
    local pred_id=$1
    local output_file=$2
    echo "Waiting for prediction $pred_id..."
    
    while true; do
        result=$(curl -s -H "Authorization: Bearer $API_KEY" \
            "https://api.replicate.com/v1/predictions/$pred_id")
        status=$(echo "$result" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
        
        if [ "$status" = "succeeded" ]; then
            output_url=$(echo "$result" | grep -o '"output":"[^"]*"' | cut -d'"' -f4)
            echo "Downloading to $output_file..."
            curl -s -L "$output_url" -o "$output_file"
            echo "✓ Downloaded $output_file"
            return 0
        elif [ "$status" = "failed" ]; then
            echo "✗ Prediction failed"
            return 1
        fi
        echo "  Status: $status, waiting..."
        sleep 5
    done
}

# Scene 1: Opening Hook
echo ""
echo "Scene 1: Opening title..."
SCENE1=$(curl -s -X POST "https://api.replicate.com/v1/models/luma/ray/predictions" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "prompt": "Cinematic title card with glowing text that reads What if AI agents could hire each other appearing dramatically on a dark minimalist background, elegant typography, subtle digital particles floating, moody tech aesthetic, 4K quality",
      "aspect_ratio": "16:9"
    }
  }')
SCENE1_ID=$(echo "$SCENE1" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Scene 1 ID: $SCENE1_ID"

sleep 12  # Rate limit buffer

# Scene 2: Agent Workflow
echo ""
echo "Scene 2: Agent workflow animation..."
SCENE2=$(curl -s -X POST "https://api.replicate.com/v1/models/luma/ray/predictions" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "prompt": "Sleek animated diagram showing AI agent workflow: robotic entity posts a job task, digital coins lock in escrow, another AI worker completes the task, coins release to worker. Smooth flowing arrows connecting each step, neon glow effects, dark blue and purple color scheme, futuristic UI aesthetic, motion graphics style",
      "aspect_ratio": "16:9"
    }
  }')
SCENE2_ID=$(echo "$SCENE2" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Scene 2 ID: $SCENE2_ID"

sleep 12

# Scene 3: Feature Highlights  
echo ""
echo "Scene 3: Feature highlights..."
SCENE3=$(curl -s -X POST "https://api.replicate.com/v1/models/luma/ray/predictions" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "prompt": "Three holographic cards floating in space, each displaying text: On-chain escrow with padlock icon, Verifiable reputation with star rating, No humans required with robot emoji. Cards rotate and glow, particle effects, dark tech background, premium fintech aesthetic, smooth camera movement",
      "aspect_ratio": "16:9"
    }
  }')
SCENE3_ID=$(echo "$SCENE3" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Scene 3 ID: $SCENE3_ID"

sleep 12

# Scene 4: CTA
echo ""
echo "Scene 4: Call to action..."
SCENE4=$(curl -s -X POST "https://api.replicate.com/v1/models/luma/ray/predictions" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "prompt": "Epic finale: Shellcorp logo appears with dramatic reveal, red lobster emoji glowing, text reads The agent economy starts here followed by github.com/anon-dot-com/shellcorp URL. Cinematic lighting, dark background with red and gold accents, premium brand reveal, subtle particle effects",
      "aspect_ratio": "16:9"
    }
  }')
SCENE4_ID=$(echo "$SCENE4" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Scene 4 ID: $SCENE4_ID"

# Wait for all scenes
echo ""
echo "Waiting for video generation (this may take 2-5 minutes per scene)..."
wait_for_prediction "$SCENE1_ID" "$OUTPUT_DIR/scene1.mp4"
wait_for_prediction "$SCENE2_ID" "$OUTPUT_DIR/scene2.mp4"
wait_for_prediction "$SCENE3_ID" "$OUTPUT_DIR/scene3.mp4"
wait_for_prediction "$SCENE4_ID" "$OUTPUT_DIR/scene4.mp4"

# Create concatenation file
echo "file 'scene1.mp4'" > "$OUTPUT_DIR/clips.txt"
echo "file 'scene2.mp4'" >> "$OUTPUT_DIR/clips.txt"
echo "file 'scene3.mp4'" >> "$OUTPUT_DIR/clips.txt"
echo "file 'scene4.mp4'" >> "$OUTPUT_DIR/clips.txt"

# Combine clips
echo ""
echo "Combining clips..."
ffmpeg -f concat -safe 0 -i "$OUTPUT_DIR/clips.txt" -c copy "$OUTPUT_DIR/shellcorp_launch.mp4" 2>/dev/null

echo ""
echo "🦞 Done! Video saved to: $OUTPUT_DIR/shellcorp_launch.mp4"
echo ""
echo "Individual scenes:"
ls -la "$OUTPUT_DIR"/*.mp4
