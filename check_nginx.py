import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('119.235.120.28', port=8222, username='root', password='vpspassword12wq', timeout=30)

# Check nginx config and logs
stdin, stdout, stderr = ssh.exec_command('cat /opt/ptt/deploy/nginx/voxrelay.conf', timeout=10)
print('=== NGINX CONFIG ===')
print(stdout.read().decode('utf-8', errors='replace'))

stdin, stdout, stderr = ssh.exec_command('docker logs --tail 50 ptt-web-gateway-1 2>&1', timeout=10)
print('\n=== NGINX LOGS (last 50) ===')
print(stdout.read().decode('utf-8', errors='replace'))

stdin, stdout, stderr = ssh.exec_command('ls -la /opt/ptt/apps/web/dist/', timeout=10)
print('\n=== DIST FILES ===')
print(stdout.read().decode('utf-8', errors='replace'))

stdin, stdout, stderr = ssh.exec_command('stat /opt/ptt/apps/web/dist/index.html 2>&1 || echo "NO INDEX.HTML"', timeout=10)
print(stdout.read().decode('utf-8', errors='replace'))

ssh.close()
