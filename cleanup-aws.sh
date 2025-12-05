#!/bin/bash
# Cleanup script to remove all AWS resources created by deployment

set -e

echo "🧹 Karaoke Arcade - AWS Cleanup Script"
echo "======================================="
echo ""
echo "⚠️  WARNING: This will delete ALL AWS resources created for Karaoke Arcade!"
echo ""
echo "This includes:"
echo "  - ECS Service and Cluster"
echo "  - Auto Scaling Group and EC2 instances"
echo "  - EFS file system (YOUR SONGS WILL BE DELETED!)"
echo "  - Security Groups"
echo "  - ECR repository and Docker images"
echo "  - CloudWatch logs"
echo ""

read -p "Are you ABSOLUTELY sure you want to continue? (type 'yes' to confirm): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Cleanup cancelled"
    exit 0
fi

echo ""
read -p "Do you want to backup your songs from EFS first? (y/N) " -n 1 -r
echo
BACKUP_SONGS=$REPLY

# Load state file if exists
STATE_FILE=".aws-deployment-state"
if [ -f "$STATE_FILE" ]; then
    source $STATE_FILE
    echo "Loaded configuration from $STATE_FILE"
else
    echo "No state file found. Using defaults..."
    export AWS_REGION=${AWS_REGION:-us-east-1}
    export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "")
fi

echo ""
echo "Region: $AWS_REGION"
echo ""

# Backup songs if requested
if [[ $BACKUP_SONGS =~ ^[Yy]$ ]]; then
    echo "📦 Backing up songs from EFS..."

    if [ -n "$EFS_ID" ] && [ -n "$PUBLIC_IP" ]; then
        mkdir -p ./songs-backup
        scp -i karaoke-key.pem -r ec2-user@$PUBLIC_IP:/mnt/efs/songs/* ./songs-backup/ 2>/dev/null || \
            echo "⚠️  Could not backup songs. You may need to do this manually."

        if [ -d "./songs-backup" ] && [ "$(ls -A ./songs-backup)" ]; then
            echo "✅ Songs backed up to ./songs-backup/"
        fi
    else
        echo "⚠️  Cannot backup - instance information not available"
    fi
fi

echo ""
echo "🗑️  Starting cleanup..."
echo ""

# 1. Delete ECS Service
echo "1️⃣  Deleting ECS service..."
aws ecs update-service \
    --cluster karaoke-cluster \
    --service karaoke-arcade \
    --desired-count 0 \
    --region $AWS_REGION 2>/dev/null || true

aws ecs delete-service \
    --cluster karaoke-cluster \
    --service karaoke-arcade \
    --force \
    --region $AWS_REGION 2>/dev/null || true

echo "✅ ECS service deleted"

# 2. Delete Auto Scaling Group
echo ""
echo "2️⃣  Deleting Auto Scaling Group..."
aws autoscaling delete-auto-scaling-group \
    --auto-scaling-group-name karaoke-asg-spot \
    --force-delete \
    --region $AWS_REGION 2>/dev/null || true

echo "✅ Auto Scaling Group deleted"

# Wait for instances to terminate
echo "Waiting for instances to terminate..."
sleep 30

# 3. Delete ECS Cluster
echo ""
echo "3️⃣  Deleting ECS cluster..."
aws ecs delete-cluster \
    --cluster karaoke-cluster \
    --region $AWS_REGION 2>/dev/null || true

echo "✅ ECS cluster deleted"

# 4. Delete Launch Template
echo ""
echo "4️⃣  Deleting launch template..."
aws ec2 delete-launch-template \
    --launch-template-name karaoke-spot-template \
    --region $AWS_REGION 2>/dev/null || true

echo "✅ Launch template deleted"

# 5. Delete EFS
echo ""
echo "5️⃣  Deleting EFS file system..."

if [ -n "$EFS_ID" ]; then
    # Delete mount targets first
    MOUNT_TARGETS=$(aws efs describe-mount-targets \
        --file-system-id $EFS_ID \
        --region $AWS_REGION \
        --query 'MountTargets[*].MountTargetId' \
        --output text 2>/dev/null || echo "")

    for MT in $MOUNT_TARGETS; do
        aws efs delete-mount-target --mount-target-id $MT --region $AWS_REGION 2>/dev/null || true
    done

    echo "Waiting for mount targets to be deleted..."
    sleep 30

    # Delete file system
    aws efs delete-file-system \
        --file-system-id $EFS_ID \
        --region $AWS_REGION 2>/dev/null || true

    echo "✅ EFS file system deleted"
else
    echo "⚠️  EFS ID not found in state file"
fi

# 6. Delete Security Group
echo ""
echo "6️⃣  Deleting security group..."

if [ -n "$SG_ID" ]; then
    # Wait a bit for resources to release
    sleep 10

    aws ec2 delete-security-group \
        --group-id $SG_ID \
        --region $AWS_REGION 2>/dev/null || \
        echo "⚠️  Could not delete security group (may still be in use)"
else
    echo "⚠️  Security group ID not found"
fi

# 7. Delete ECR Repository
echo ""
echo "7️⃣  Deleting ECR repository..."
aws ecr delete-repository \
    --repository-name karaoke-arcade \
    --force \
    --region $AWS_REGION 2>/dev/null || true

echo "✅ ECR repository deleted"

# 8. Delete CloudWatch Logs
echo ""
echo "8️⃣  Deleting CloudWatch logs..."
aws logs delete-log-group \
    --log-group-name /ecs/karaoke-arcade \
    --region $AWS_REGION 2>/dev/null || true

echo "✅ CloudWatch logs deleted"

# 9. Delete Key Pair (optional)
echo ""
read -p "Delete SSH key pair? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    aws ec2 delete-key-pair \
        --key-name karaoke-key \
        --region $AWS_REGION 2>/dev/null || true

    if [ -f "karaoke-key.pem" ]; then
        rm karaoke-key.pem
    fi

    echo "✅ SSH key pair deleted"
fi

# 10. Clean up local files
echo ""
echo "9️⃣  Cleaning up local files..."

if [ -f "$STATE_FILE" ]; then
    rm $STATE_FILE
    echo "✅ State file deleted"
fi

if [ -f "/tmp/task-definition.json" ]; then
    rm /tmp/task-definition.json
fi

if [ -f "/tmp/user-data.txt" ]; then
    rm /tmp/user-data.txt
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✅ Cleanup Complete!"
echo "════════════════════════════════════════════════════════════"
echo ""

if [ -d "./songs-backup" ]; then
    echo "📦 Your songs are backed up in: ./songs-backup/"
    echo ""
fi

echo "All AWS resources have been deleted."
echo ""
echo "Note: It may take a few minutes for all resources to be fully removed."
echo "Check your AWS console to verify everything is deleted."
echo ""


