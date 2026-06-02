import paramiko, os

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('119.235.120.28', port=8222, username='root', password='vpspassword12wq', timeout=30)

sftp = ssh.open_sftp()
dist_local = r'C:\Users\User\Desktop\ptt\apps\web\dist'
dist_remote = '/opt/ptt/apps/web/dist'

# Do not rm -rf dist while web-gateway bind-mounts it (container keeps stale empty dir)
ssh.exec_command('mkdir -p ' + dist_remote + '/assets')

for root, dirs, files in os.walk(dist_local):
    for name in dirs:
        local_path = os.path.join(root, name)
        rel_path = os.path.relpath(local_path, dist_local)
        remote_path = os.path.join(dist_remote, rel_path).replace('\\', '/')
        try:
            sftp.mkdir(remote_path)
        except:
            pass
    for name in files:
        local_path = os.path.join(root, name)
        rel_path = os.path.relpath(local_path, dist_local)
        remote_path = os.path.join(dist_remote, rel_path).replace('\\', '/')
        sftp.put(local_path, remote_path)

sftp.close()
print('Frontend uploaded OK')

# Remount bind volume (safe after in-place upload)
_, stdout, _ = ssh.exec_command('cd /opt/ptt && docker compose up -d --force-recreate web-gateway 2>&1')
print(stdout.read().decode())

_, stdout, _ = ssh.exec_command('cd /opt/ptt && docker compose exec -T web-gateway nginx -s reload 2>&1')
print('Nginx reloaded:', stdout.read().decode())

ssh.close()
print('DONE')
