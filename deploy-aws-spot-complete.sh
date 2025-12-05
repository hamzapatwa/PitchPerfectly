#!/bin/bash
# Complete AWS Deployment Script for Karaoke Arcade with Spot Instances
# This script automates the entire deployment process

set -e

echo "🎤 Karaoke Arcade - Complete AWS Spot Deployment"
echo "=================================================="
echo ""
echo "This script will:"
echo "  1. Set up AWS infrastructure (VPC, Security Groups, EFS)"
echo "  2. Upload your song library to EFS"
echo "  3. Build and push Docker image to ECR"
echo "  4. Create ECS cluster with g4dn.xlarge Spot instances"
echo "  5. Deploy your application"
echo ""
echo "Estimated time: 15-20 minutes"
echo "Estimated cost: ~$130-150/month (with Spot instances)"
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo "ℹ️  $1"
}

# Check prerequisites
echo "🔍 Checking prerequisites..."

if ! command -v aws &> /dev/null; then
    print_error "AWS CLI is not installed!"
    echo "Install it from: https://aws.amazon.com/cli/"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed!"
    echo "Install it from: https://www.docker.com/get-started"
    exit 1
fi

if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running!"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    print_warning "jq is not installed (recommended for JSON parsing)"
    echo "Install it with: brew install jq (Mac) or apt-get install jq (Linux)"
    read -p "Continue without jq? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

print_success "Prerequisites check passed"
echo ""

# Get AWS configuration
echo "📋 AWS Configuration"
echo "===================="

# Check if AWS is configured
if ! aws sts get-caller-identity &> /dev/null; then
    print_error "AWS CLI is not configured!"
    echo ""
    echo "Run: aws configure"
    echo "You'll need:"
    echo "  - AWS Access Key ID"
    echo "  - AWS Secret Access Key"
    echo "  - Default region (e.g., us-east-1)"
    exit 1
fi

# Get AWS account ID
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_REGION=${AWS_REGION:-us-east-1}

echo "AWS Account ID: $AWS_ACCOUNT_ID"
echo "AWS Region: $AWS_REGION"
echo ""

read -p "Is this correct? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Please set AWS_REGION environment variable and run again"
    exit 1
fi

# Check for existing song library
echo ""
echo "🎵 Song Library Check"
echo "===================="

if [ -d "./songs" ] && [ "$(ls -A ./songs 2>/dev/null)" ]; then
    SONG_COUNT=$(find ./songs -type d -mindepth 1 -maxdepth 1 | wc -l)
    print_success "Found song library with $SONG_COUNT songs"
    UPLOAD_SONGS=true
else
    print_warning "No songs found in ./songs directory"
    echo "You can upload songs later through the web interface"
    UPLOAD_SONGS=false
    read -p "Continue without songs? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check for database
if [ -f "./backend/karaoke.db" ]; then
    print_success "Found existing database"
    UPLOAD_DB=true
else
    print_info "No existing database found (will create new one)"
    UPLOAD_DB=false
fi

echo ""
echo "💰 Cost Estimate"
echo "==============="
echo "Monthly costs (approximate):"
echo "  - g4dn.xlarge Spot: ~$114/month (70% discount)"
echo "  - EFS storage: ~$15/month (for 50GB)"
echo "  - Data transfer: ~$5-10/month"
echo "  - Total: ~$130-150/month"
echo ""
echo "You can stop the service when not in use to save money!"
echo ""

read -p "Ready to deploy? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled"
    exit 0
fi

echo ""
echo "🚀 Starting deployment..."
echo ""

# Save state file for cleanup
STATE_FILE=".aws-deployment-state"
echo "AWS_ACCOUNT_ID=$AWS_ACCOUNT_ID" > $STATE_FILE
echo "AWS_REGION=$AWS_REGION" >> $STATE_FILE

# Step 1: Get or create VPC
echo "1️⃣  Setting up VPC and networking..."

export VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text --region $AWS_REGION)

if [ "$VPC_ID" == "None" ] || [ -z "$VPC_ID" ]; then
    print_error "No default VPC found. Creating new VPC..."
    # This would require more complex setup - for now, require default VPC
    print_error "Please create a default VPC in your AWS account first"
    exit 1
fi

print_success "Using VPC: $VPC_ID"
echo "VPC_ID=$VPC_ID" >> $STATE_FILE

# Get subnets
export SUBNET_1=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" --query "Subnets[0].SubnetId" --output text --region $AWS_REGION)
export SUBNET_2=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" --query "Subnets[1].SubnetId" --output text --region $AWS_REGION)

if [ -z "$SUBNET_1" ] || [ -z "$SUBNET_2" ]; then
    print_error "Could not find at least 2 subnets in VPC"
    exit 1
fi

print_success "Using subnets: $SUBNET_1, $SUBNET_2"
echo "SUBNET_1=$SUBNET_1" >> $STATE_FILE
echo "SUBNET_2=$SUBNET_2" >> $STATE_FILE

# Step 2: Create security group
echo ""
echo "2️⃣  Creating security group..."

# Check if security group already exists
SG_ID=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=karaoke-arcade-sg" "Name=vpc-id,Values=$VPC_ID" --query "SecurityGroups[0].GroupId" --output text --region $AWS_REGION 2>/dev/null || echo "")

if [ "$SG_ID" == "None" ] || [ -z "$SG_ID" ]; then
    export SG_ID=$(aws ec2 create-security-group \
        --group-name karaoke-arcade-sg \
        --description "Security group for Karaoke Arcade" \
        --vpc-id $VPC_ID \
        --region $AWS_REGION \
        --output text --query 'GroupId')

    # Allow HTTP traffic (port 8080)
    aws ec2 authorize-security-group-ingress \
        --group-id $SG_ID \
        --protocol tcp \
        --port 8080 \
        --cidr 0.0.0.0/0 \
        --region $AWS_REGION 2>/dev/null || true

    # Allow SSH
    aws ec2 authorize-security-group-ingress \
        --group-id $SG_ID \
        --protocol tcp \
        --port 22 \
        --cidr 0.0.0.0/0 \
        --region $AWS_REGION 2>/dev/null || true

    # Allow NFS for EFS
    aws ec2 authorize-security-group-ingress \
        --group-id $SG_ID \
        --protocol tcp \
        --port 2049 \
        --source-group $SG_ID \
        --region $AWS_REGION 2>/dev/null || true

    print_success "Security group created: $SG_ID"
else
    print_success "Using existing security group: $SG_ID"
fi

echo "SG_ID=$SG_ID" >> $STATE_FILE

# Step 3: Create EFS
echo ""
echo "3️⃣  Creating EFS file system..."

# Check if EFS already exists
EFS_ID=$(aws efs describe-file-systems --query "FileSystems[?Tags[?Key=='Name' && Value=='karaoke-arcade-songs']].FileSystemId" --output text --region $AWS_REGION 2>/dev/null || echo "")

if [ -z "$EFS_ID" ]; then
    export EFS_ID=$(aws efs create-file-system \
        --performance-mode generalPurpose \
        --throughput-mode bursting \
        --encrypted \
        --tags Key=Name,Value=karaoke-arcade-songs \
        --region $AWS_REGION \
        --query 'FileSystemId' \
        --output text)

    print_success "EFS created: $EFS_ID"

    # Wait for EFS to become available
    echo "Waiting for EFS to be available..."
    aws efs wait file-system-available --file-system-id $EFS_ID --region $AWS_REGION

    # Create mount targets
    print_info "Creating EFS mount targets..."
    aws efs create-mount-target \
        --file-system-id $EFS_ID \
        --subnet-id $SUBNET_1 \
        --security-groups $SG_ID \
        --region $AWS_REGION > /dev/null || true

    aws efs create-mount-target \
        --file-system-id $EFS_ID \
        --subnet-id $SUBNET_2 \
        --security-groups $SG_ID \
        --region $AWS_REGION > /dev/null || true

    # Wait for mount targets
    sleep 30
    print_success "EFS mount targets created"
else
    print_success "Using existing EFS: $EFS_ID"
fi

echo "EFS_ID=$EFS_ID" >> $STATE_FILE

# Step 4: Create ECR repository
echo ""
echo "4️⃣  Creating ECR repository..."

aws ecr describe-repositories --repository-names karaoke-arcade --region $AWS_REGION &> /dev/null || \
    aws ecr create-repository --repository-name karaoke-arcade --region $AWS_REGION > /dev/null

print_success "ECR repository ready"

# Step 5: Upload songs to EFS (if needed)
if [ "$UPLOAD_SONGS" = true ]; then
    echo ""
    echo "5️⃣  Uploading songs to EFS..."

    # Create key pair if doesn't exist
    if ! aws ec2 describe-key-pairs --key-names karaoke-key --region $AWS_REGION &> /dev/null; then
        aws ec2 create-key-pair \
            --key-name karaoke-key \
            --region $AWS_REGION \
            --query 'KeyMaterial' \
            --output text > karaoke-key.pem
        chmod 400 karaoke-key.pem
        print_success "SSH key created: karaoke-key.pem"
    else
        if [ ! -f "karaoke-key.pem" ]; then
            print_warning "Key pair exists but karaoke-key.pem not found locally"
            print_info "Skipping song upload. You can upload songs later via the web interface"
            UPLOAD_SONGS=false
        fi
    fi

    if [ "$UPLOAD_SONGS" = true ]; then
        # Get latest Amazon Linux 2 AMI
        AMI_ID=$(aws ec2 describe-images \
            --owners amazon \
            --filters "Name=name,Values=amzn2-ami-hvm-*-x86_64-gp2" "Name=state,Values=available" \
            --query 'sort_by(Images, &CreationDate)[-1].ImageId' \
            --output text \
            --region $AWS_REGION)

        print_info "Launching temporary instance for file upload..."
        TEMP_INSTANCE_ID=$(aws ec2 run-instances \
            --image-id $AMI_ID \
            --instance-type t3.micro \
            --key-name karaoke-key \
            --security-group-ids $SG_ID \
            --subnet-id $SUBNET_1 \
            --region $AWS_REGION \
            --query 'Instances[0].InstanceId' \
            --output text)

        echo "TEMP_INSTANCE_ID=$TEMP_INSTANCE_ID" >> $STATE_FILE

        print_info "Waiting for instance to be running..."
        aws ec2 wait instance-running --instance-ids $TEMP_INSTANCE_ID --region $AWS_REGION

        # Get public IP
        TEMP_IP=$(aws ec2 describe-instances \
            --instance-ids $TEMP_INSTANCE_ID \
            --region $AWS_REGION \
            --query 'Reservations[0].Instances[0].PublicIpAddress' \
            --output text)

        print_info "Instance IP: $TEMP_IP"
        print_info "Waiting for SSH to be ready..."
        sleep 30

        # Mount EFS and upload files
        print_info "Mounting EFS and uploading songs..."

        # Install EFS utils and mount
        ssh -i karaoke-key.pem -o StrictHostKeyChecking=no ec2-user@$TEMP_IP << EOF
sudo yum install -y amazon-efs-utils
sudo mkdir -p /mnt/efs
sudo mount -t efs -o tls $EFS_ID:/ /mnt/efs
sudo mkdir -p /mnt/efs/songs /mnt/efs/sessions /mnt/efs/database
sudo chmod -R 777 /mnt/efs
EOF

        # Upload songs
        print_info "Uploading songs (this may take a while)..."
        scp -i karaoke-key.pem -o StrictHostKeyChecking=no -r ./songs/* ec2-user@$TEMP_IP:/tmp/songs/ 2>/dev/null || true
        ssh -i karaoke-key.pem ec2-user@$TEMP_IP "sudo cp -r /tmp/songs/* /mnt/efs/songs/ 2>/dev/null || true"

        # Upload database if exists
        if [ "$UPLOAD_DB" = true ]; then
            print_info "Uploading database..."
            scp -i karaoke-key.pem -o StrictHostKeyChecking=no ./backend/karaoke.db ec2-user@$TEMP_IP:/tmp/
            ssh -i karaoke-key.pem ec2-user@$TEMP_IP "sudo cp /tmp/karaoke.db /mnt/efs/database/"
        fi

        print_success "Files uploaded to EFS"

        # Terminate temporary instance
        print_info "Terminating temporary instance..."
        aws ec2 terminate-instances --instance-ids $TEMP_INSTANCE_ID --region $AWS_REGION > /dev/null
        print_success "Temporary instance terminated"
    fi
else
    echo ""
    echo "5️⃣  Skipping song upload (no songs found)"
fi

# Step 6: Build and push Docker image
echo ""
echo "6️⃣  Building and pushing Docker image..."

print_info "Building Docker image..."
docker build -t karaoke-arcade:latest . > /dev/null

print_info "Logging in to ECR..."
aws ecr get-login-password --region $AWS_REGION | \
    docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

print_info "Tagging and pushing image..."
docker tag karaoke-arcade:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/karaoke-arcade:latest
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/karaoke-arcade:latest

print_success "Docker image pushed to ECR"

# Step 7: Create ECS cluster
echo ""
echo "7️⃣  Creating ECS cluster..."

aws ecs describe-clusters --clusters karaoke-cluster --region $AWS_REGION &> /dev/null || \
    aws ecs create-cluster --cluster-name karaoke-cluster --region $AWS_REGION > /dev/null

print_success "ECS cluster ready"

# Step 8: Create IAM roles
echo ""
echo "8️⃣  Setting up IAM roles..."

# Create ecsInstanceRole if doesn't exist
if ! aws iam get-role --role-name ecsInstanceRole &> /dev/null; then
    print_info "Creating ecsInstanceRole..."

    aws iam create-role \
        --role-name ecsInstanceRole \
        --assume-role-policy-document '{
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Principal": {"Service": "ec2.amazonaws.com"},
                "Action": "sts:AssumeRole"
            }]
        }' > /dev/null

    aws iam attach-role-policy \
        --role-name ecsInstanceRole \
        --policy-arn arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role

    aws iam create-instance-profile --instance-profile-name ecsInstanceRole > /dev/null 2>&1 || true
    aws iam add-role-to-instance-profile \
        --instance-profile-name ecsInstanceRole \
        --role-name ecsInstanceRole 2>/dev/null || true

    print_info "Waiting for IAM role to propagate..."
    sleep 15
fi

print_success "IAM roles configured"

# Step 9: Create launch template
echo ""
echo "9️⃣  Creating launch template for Spot instances..."

# Get ECS-optimized GPU AMI
print_info "Getting latest ECS GPU-optimized AMI..."
ECS_GPU_AMI=$(aws ssm get-parameters \
    --names /aws/service/ecs/optimized-ami/amazon-linux-2/gpu/recommended \
    --region $AWS_REGION \
    --query 'Parameters[0].Value' \
    --output text | python3 -c "import sys, json; print(json.load(sys.stdin)['image_id'])" 2>/dev/null || \
    aws ssm get-parameters \
        --names /aws/service/ecs/optimized-ami/amazon-linux-2/gpu/recommended \
        --region $AWS_REGION \
        --query 'Parameters[0].Value' \
        --output text | grep -o 'ami-[a-z0-9]*' | head -1)

print_info "Using AMI: $ECS_GPU_AMI"

# Create user data
cat > /tmp/user-data.txt << EOF
#!/bin/bash
echo ECS_CLUSTER=karaoke-cluster >> /etc/ecs/ecs.config
echo ECS_ENABLE_GPU_SUPPORT=true >> /etc/ecs/ecs.config
EOF

USER_DATA_BASE64=$(base64 /tmp/user-data.txt | tr -d '\n')

# Delete old launch template if exists
aws ec2 delete-launch-template --launch-template-name karaoke-spot-template --region $AWS_REGION 2>/dev/null || true

# Create launch template
aws ec2 create-launch-template \
    --launch-template-name karaoke-spot-template \
    --region $AWS_REGION \
    --launch-template-data "{
        \"ImageId\": \"$ECS_GPU_AMI\",
        \"InstanceType\": \"g4dn.xlarge\",
        \"KeyName\": \"karaoke-key\",
        \"SecurityGroupIds\": [\"$SG_ID\"],
        \"IamInstanceProfile\": {
            \"Name\": \"ecsInstanceRole\"
        },
        \"UserData\": \"$USER_DATA_BASE64\",
        \"InstanceMarketOptions\": {
            \"MarketType\": \"spot\",
            \"SpotOptions\": {
                \"MaxPrice\": \"0.30\",
                \"SpotInstanceType\": \"one-time\"
            }
        },
        \"TagSpecifications\": [{
            \"ResourceType\": \"instance\",
            \"Tags\": [{\"Key\": \"Name\", \"Value\": \"karaoke-ecs-spot\"}]
        }]
    }" > /dev/null

print_success "Launch template created"

# Step 10: Create Auto Scaling Group
echo ""
echo "🔟 Creating Auto Scaling Group with Spot instances..."

# Delete old ASG if exists
aws autoscaling delete-auto-scaling-group \
    --auto-scaling-group-name karaoke-asg-spot \
    --force-delete \
    --region $AWS_REGION 2>/dev/null || true

sleep 5

# Create new ASG
aws autoscaling create-auto-scaling-group \
    --auto-scaling-group-name karaoke-asg-spot \
    --launch-template "LaunchTemplateName=karaoke-spot-template,Version=\$Latest" \
    --min-size 1 \
    --max-size 2 \
    --desired-capacity 1 \
    --vpc-zone-identifier "$SUBNET_1,$SUBNET_2" \
    --region $AWS_REGION \
    --tags "Key=Name,Value=karaoke-ecs-spot,PropagateAtLaunch=true"

print_success "Auto Scaling Group created"
echo "ASG_NAME=karaoke-asg-spot" >> $STATE_FILE

# Step 11: Register task definition
echo ""
echo "1️⃣1️⃣  Registering ECS task definition..."

cat > /tmp/task-definition.json << EOF
{
  "family": "karaoke-arcade",
  "networkMode": "bridge",
  "requiresCompatibilities": ["EC2"],
  "cpu": "2048",
  "memory": "8192",
  "containerDefinitions": [{
    "name": "karaoke-arcade",
    "image": "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/karaoke-arcade:latest",
    "essential": true,
    "portMappings": [{
      "containerPort": 8080,
      "hostPort": 8080,
      "protocol": "tcp"
    }],
    "environment": [
      {"name": "DEVICE", "value": "auto"},
      {"name": "PORT", "value": "8080"},
      {"name": "NODE_ENV", "value": "production"}
    ],
    "resourceRequirements": [{
      "type": "GPU",
      "value": "1"
    }],
    "mountPoints": [
      {"sourceVolume": "songs", "containerPath": "/app/songs"},
      {"sourceVolume": "sessions", "containerPath": "/app/sessions"},
      {"sourceVolume": "database", "containerPath": "/app/backend"}
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/karaoke-arcade",
        "awslogs-region": "$AWS_REGION",
        "awslogs-stream-prefix": "ecs",
        "awslogs-create-group": "true"
      }
    }
  }],
  "volumes": [
    {
      "name": "songs",
      "efsVolumeConfiguration": {
        "fileSystemId": "$EFS_ID",
        "rootDirectory": "/songs",
        "transitEncryption": "ENABLED"
      }
    },
    {
      "name": "sessions",
      "efsVolumeConfiguration": {
        "fileSystemId": "$EFS_ID",
        "rootDirectory": "/sessions",
        "transitEncryption": "ENABLED"
      }
    },
    {
      "name": "database",
      "efsVolumeConfiguration": {
        "fileSystemId": "$EFS_ID",
        "rootDirectory": "/database",
        "transitEncryption": "ENABLED"
      }
    }
  ]
}
EOF

aws ecs register-task-definition \
    --cli-input-json file:///tmp/task-definition.json \
    --region $AWS_REGION > /dev/null

print_success "Task definition registered"

# Step 12: Create ECS service
echo ""
echo "1️⃣2️⃣  Creating ECS service..."

print_info "Waiting for EC2 instance to join cluster (this may take 2-3 minutes)..."

# Wait for container instance
for i in {1..60}; do
    INSTANCE_COUNT=$(aws ecs describe-clusters --clusters karaoke-cluster --region $AWS_REGION --query 'clusters[0].registeredContainerInstancesCount' --output text)
    if [ "$INSTANCE_COUNT" -gt 0 ]; then
        break
    fi
    sleep 5
done

if [ "$INSTANCE_COUNT" -eq 0 ]; then
    print_warning "No instances joined the cluster yet. The service will start once an instance is available."
fi

# Delete old service if exists
aws ecs delete-service \
    --cluster karaoke-cluster \
    --service karaoke-arcade \
    --force \
    --region $AWS_REGION 2>/dev/null || true

sleep 10

# Create service
aws ecs create-service \
    --cluster karaoke-cluster \
    --service-name karaoke-arcade \
    --task-definition karaoke-arcade \
    --desired-count 1 \
    --launch-type EC2 \
    --region $AWS_REGION > /dev/null

print_success "ECS service created"

# Step 13: Get access information
echo ""
echo "1️⃣3️⃣  Getting access information..."

print_info "Waiting for task to start..."
sleep 30

# Get container instance
CONTAINER_INSTANCE=$(aws ecs list-container-instances \
    --cluster karaoke-cluster \
    --region $AWS_REGION \
    --query 'containerInstanceArns[0]' \
    --output text 2>/dev/null || echo "")

if [ -n "$CONTAINER_INSTANCE" ] && [ "$CONTAINER_INSTANCE" != "None" ]; then
    # Get EC2 instance ID
    EC2_INSTANCE=$(aws ecs describe-container-instances \
        --cluster karaoke-cluster \
        --container-instances $CONTAINER_INSTANCE \
        --region $AWS_REGION \
        --query 'containerInstances[0].ec2InstanceId' \
        --output text)

    # Get public IP
    PUBLIC_IP=$(aws ec2 describe-instances \
        --instance-ids $EC2_INSTANCE \
        --region $AWS_REGION \
        --query 'Reservations[0].Instances[0].PublicIpAddress' \
        --output text)

    echo "PUBLIC_IP=$PUBLIC_IP" >> $STATE_FILE
fi

# Final output
echo ""
echo "════════════════════════════════════════════════════════════"
echo "🎉 Deployment Complete!"
echo "════════════════════════════════════════════════════════════"
echo ""

if [ -n "$PUBLIC_IP" ] && [ "$PUBLIC_IP" != "None" ]; then
    print_success "Your Karaoke Arcade is running!"
    echo ""
    echo "🌐 Access URL: http://$PUBLIC_IP:8080"
    echo ""
else
    print_warning "Instance is still starting up..."
    echo ""
    echo "Run this command in a few minutes to get the URL:"
    echo "  aws ecs list-container-instances --cluster karaoke-cluster --region $AWS_REGION"
fi

echo "📊 Monitoring:"
echo "  View logs: aws logs tail /ecs/karaoke-arcade --follow --region $AWS_REGION"
echo "  Check service: aws ecs describe-services --cluster karaoke-cluster --services karaoke-arcade --region $AWS_REGION"
echo ""

echo "💰 Cost Management:"
echo "  Stop service: aws ecs update-service --cluster karaoke-cluster --service karaoke-arcade --desired-count 0 --region $AWS_REGION"
echo "  Start service: aws ecs update-service --cluster karaoke-cluster --service karaoke-arcade --desired-count 1 --region $AWS_REGION"
echo ""

echo "🔧 Maintenance:"
echo "  SSH to instance: ssh -i karaoke-key.pem ec2-user@$PUBLIC_IP"
echo "  Check GPU: ssh -i karaoke-key.pem ec2-user@$PUBLIC_IP 'docker exec \$(docker ps -q) nvidia-smi'"
echo ""

echo "📝 Deployment state saved to: $STATE_FILE"
echo ""

print_success "All done! Enjoy your Karaoke Arcade! 🎤🎉"


