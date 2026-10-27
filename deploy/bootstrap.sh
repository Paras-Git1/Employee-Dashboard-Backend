#!/bin/bash
# Prepares the server: Docker, the compose plugin, AWS CLI v2 and swap.
# Safe to run on every deploy (skips what is already installed). Ubuntu 22.04+/Debian or Amazon Linux 2023.
set -euo pipefail

if command -v apt-get >/dev/null; then
  if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1 || ! command -v unzip >/dev/null; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -q
    apt-get install -y -q docker.io docker-compose-v2 unzip curl openssl
  fi
elif command -v dnf >/dev/null; then
  if ! command -v docker >/dev/null; then dnf install -y docker openssl unzip; fi
  if ! docker compose version >/dev/null 2>&1; then
    mkdir -p /usr/local/lib/docker/cli-plugins
    curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
      -o /usr/local/lib/docker/cli-plugins/docker-compose
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  fi
fi
systemctl enable --now docker

if ! /usr/local/bin/aws --version >/dev/null 2>&1 && ! command -v aws >/dev/null; then
  tmp=$(mktemp -d)
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o "$tmp/awscli.zip"
  unzip -q "$tmp/awscli.zip" -d "$tmp"
  "$tmp/aws/install" --update
  rm -rf "$tmp"
fi

if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile swap swap defaults 0 0' >> /etc/fstab
fi

mkdir -p /opt/employee-dashboard
