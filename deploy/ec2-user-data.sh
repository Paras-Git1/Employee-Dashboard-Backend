#!/bin/bash
# EC2 user data (Amazon Linux 2023): installs Docker and the compose plugin, adds swap.
set -euxo pipefail

dnf install -y docker openssl
systemctl enable --now docker

mkdir -p /usr/local/lib/docker/cli-plugins
arch=$(uname -m)
curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-${arch}" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

if [ ! -f /swapfile ]; then
  dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile swap swap defaults 0 0' >> /etc/fstab
fi

mkdir -p /opt/employee-dashboard
