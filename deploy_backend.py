import paramiko, sys

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('119.235.120.28', port=8222, username='root', password='vpspassword12wq', timeout=30)

print('Building voxrelay-server...')
stdin, stdout, stderr = ssh.exec_command('cd /opt/ptt && docker compose build --no-cache voxrelay-server 2>&1', timeout=600)
out = stdout.read().decode('utf-8', errors='replace')
print(out[-500:] if len(out) > 500 else out)
err = stderr.read().decode('utf-8', errors='replace')
if err.strip(): print('ERR:', err[-500:])

print('\nUpdating voxrelay-server...')
stdin, stdout, stderr = ssh.exec_command('cd /opt/ptt && docker compose up -d voxrelay-server 2>&1', timeout=120)
print(stdout.read().decode('utf-8', errors='replace'))
err = stderr.read().decode('utf-8', errors='replace')
if err.strip(): print('ERR:', err)

ssh.close()
print('Backend deploy DONE')
