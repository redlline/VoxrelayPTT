import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('119.235.120.28', port=8222, username='root', password='vpspassword12wq')

# Upload backend files
sftp = ssh.open_sftp()
for local, remote in [
    (r'C:\Users\User\Desktop\ptt\services\api-gateway\src\routes\messages.ts', '/opt/ptt/services/api-gateway/src/routes/messages.ts'),
    (r'C:\Users\User\Desktop\ptt\services\api-gateway\src\routes\ws.ts', '/opt/ptt/services/api-gateway/src/routes/ws.ts'),
]:
    sftp.put(local, remote)
sftp.close()

# Rebuild and restart - just send command, don't wait for output
ssh.exec_command('cd /opt/ptt && docker compose build --no-cache voxrelay-server > /tmp/build.log 2>&1')
print("Build started in background. Waiting 60s...")

import time
time.sleep(60)

stdin, stdout, stderr = ssh.exec_command('tail -5 /tmp/build.log 2>&1')
print('=== build log (last 5 lines) ===')
print(stdout.read().decode('utf-8', errors='replace'))

stdin, stdout, stderr = ssh.exec_command('cd /opt/ptt && docker compose up -d 2>&1')
print('\n=== docker compose up -d ===')
print(stdout.read().decode('utf-8', errors='replace'))

time.sleep(10)
stdin, stdout, stderr = ssh.exec_command('curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health 2>&1')
print(f'\nHealth: {stdout.read().decode("utf-8", errors="replace")}')

stdin, stdout, stderr = ssh.exec_command('docker ps --format "table {{.Names}}\t{{.Status}}" 2>&1')
print(stdout.read().decode('utf-8', errors='replace'))

# Verify code changes in container
stdin, stdout, stderr = ssh.exec_command("grep 'display_name' /opt/ptt/services/api-gateway/src/routes/messages.ts 2>&1")
print('\n=== Backend code verification ===')
print(stdout.read().decode('utf-8', errors='replace'))

stdin, stdout, stderr = ssh.exec_command("grep 'is_active' /opt/ptt/services/api-gateway/src/routes/ws.ts 2>&1")
print(stdout.read().decode('utf-8', errors='replace'))

ssh.close()
