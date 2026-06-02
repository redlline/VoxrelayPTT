import paramiko, os

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('119.235.120.28', port=8222, username='root', password='vpspassword12wq')
sftp = ssh.open_sftp()

dist_local = r'C:\Users\User\Desktop\ptt\apps\web\dist'
dist_remote = '/opt/ptt/apps/web/dist'

def upload_dir(sftp, local_dir, remote_dir):
    for item in os.listdir(local_dir):
        local_path = os.path.join(local_dir, item)
        remote_path = os.path.join(remote_dir, item).replace('\\', '/')
        if os.path.isdir(local_path):
            try: sftp.stat(remote_path)
            except: sftp.mkdir(remote_path)
            upload_dir(sftp, local_path, remote_path)
        else:
            sftp.put(local_path, remote_path)

print("Uploading frontend dist...")
upload_dir(sftp, dist_local, dist_remote)

for local, remote in [
    (r'C:\Users\User\Desktop\ptt\services\api-gateway\src\routes\messages.ts', '/opt/ptt/services/api-gateway/src/routes/messages.ts'),
]:
    sftp.put(local, remote)

sftp.close()

import time
ssh.exec_command('cd /opt/ptt && docker compose build --no-cache voxrelay-server > /tmp/build3.log 2>&1')
print("Backend building...")
time.sleep(90)

stdin, stdout, stderr = ssh.exec_command('tail -3 /tmp/build3.log 2>&1')
print(stdout.read().decode('utf-8', errors='replace'))

stdin, stdout, stderr = ssh.exec_command('cd /opt/ptt && docker compose up -d 2>&1')
print(stdout.read().decode('utf-8', errors='replace')[-300:])

time.sleep(10)
stdin, stdout, stderr = ssh.exec_command('curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health 2>&1')
print(f'Health: {stdout.read().decode("utf-8", errors="replace")}')

stdin, stdout, stderr = ssh.exec_command('docker ps --format "table {{.Names}}\t{{.Status}}" 2>&1')
print(stdout.read().decode('utf-8', errors='replace'))

ssh.close()
