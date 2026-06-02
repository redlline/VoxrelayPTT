import paramiko
import os

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('119.235.120.28', port=8222, username='root', password='vpspassword12wq')
sftp = ssh.open_sftp()

dist_local = r'C:\Users\User\Desktop\ptt\apps\web\dist'
dist_remote = '/opt/ptt/apps/web/dist'

# 1. Upload docker-compose.yml
print("Uploading docker-compose.yml...")
sftp.put(r'C:\Users\User\Desktop\ptt\docker-compose.yml', '/opt/ptt/docker-compose.yml')

# 2. Upload backend files
backend_files = [
    ('services/api-gateway/src/routes/sfu.ts', '/opt/ptt/services/api-gateway/src/routes/sfu.ts'),
    ('services/api-gateway/src/routes/webrtc.ts', '/opt/ptt/services/api-gateway/src/routes/webrtc.ts'),
    ('services/api-gateway/src/mediasoup/config.ts', '/opt/ptt/services/api-gateway/src/mediasoup/config.ts'),
    ('services/api-gateway/src/mediasoup/transport-manager.ts', '/opt/ptt/services/api-gateway/src/mediasoup/transport-manager.ts'),
]
for local, remote in backend_files:
    print(f"Uploading {local}...")
    sftp.put(os.path.join(r'C:\Users\User\Desktop\ptt', local), remote)

# 3. Upload frontend dist
print("Uploading frontend dist...")
import stat

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

upload_dir(sftp, dist_local, dist_remote)
print("Frontend dist uploaded.")

sftp.close()

# 4. Rebuild backend image
print("\nRebuilding backend image (no-cache)...")
stdin, stdout, stderr = ssh.exec_command('cd /opt/ptt && docker compose build --no-cache voxrelay-server 2>&1')
for line in iter(stdout.readline, ''):
    print(line.strip())
for line in iter(stderr.readline, ''):
    print(line.strip())

print("\nRecreating services...")
stdin, stdout, stderr = ssh.exec_command('cd /opt/ptt && docker compose up -d 2>&1')
for line in iter(stdout.readline, ''):
    print(line.strip())
for line in iter(stderr.readline, ''):
    print(line.strip())

ssh.close()
print("\n=== Deploy complete ===")
