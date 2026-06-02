import paramiko, os

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('119.235.120.28', port=8222, username='root', password='vpspassword12wq')
sftp = ssh.open_sftp()

# Upload frontend dist
dist_local = r'C:\Users\User\Desktop\ptt\apps\web\dist'
dist_remote = '/opt/ptt/apps/web/dist'

def upload_dir(sftp, local_dir, remote_dir):
    for item in os.listdir(local_dir):
        local_path = os.path.join(local_dir, item)
        remote_path = os.path.join(remote_dir, item).replace('\\', '/')
        if os.path.isdir(local_path):
            try:
                sftp.stat(remote_path)
            except:
                sftp.mkdir(remote_path)
            upload_dir(sftp, local_path, remote_path)
        else:
            sftp.put(local_path, remote_path)

print("Uploading frontend dist...")
upload_dir(sftp, dist_local, dist_remote)

# Upload backend files
backend_files = [
    ('services/api-gateway/src/routes/messages.ts', '/opt/ptt/services/api-gateway/src/routes/messages.ts'),
    ('services/api-gateway/src/routes/ws.ts', '/opt/ptt/services/api-gateway/src/routes/ws.ts'),
]
for local, remote in backend_files:
    print(f"Uploading {local}...")
    sftp.put(os.path.join(r'C:\Users\User\Desktop\ptt', local), remote)

sftp.close()

# Rebuild backend
print("\nRebuilding backend image (no-cache)...")
stdin, stdout, stderr = ssh.exec_command('cd /opt/ptt && docker compose build --no-cache voxrelay-server 2>&1')
for line in iter(stdout.readline, ''):
    pass  # suppress huge output
print("Build done. Recreating services...")

stdin, stdout, stderr = ssh.exec_command('cd /opt/ptt && docker compose up -d 2>&1')
out = stdout.read().decode('utf-8', errors='replace')
err = stderr.read().decode('utf-8', errors='replace')
print(out[-500:])
print(err[-500:])

stdin, stdout, stderr = ssh.exec_command('docker ps --format "table {{.Names}}\t{{.Status}}" 2>&1')
print('\n=== container status ===')
print(stdout.read().decode('utf-8', errors='replace'))

ssh.close()
print("\n=== Deploy complete ===")
