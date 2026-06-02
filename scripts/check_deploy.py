import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('119.235.120.28', port=8222, username='root', password='vpspassword12wq')

stdin, stdout, stderr = ssh.exec_command('cd /opt/ptt && docker compose up -d 2>&1')
out = stdout.read().decode('utf-8', errors='replace')
err = stderr.read().decode('utf-8', errors='replace')
print('=== docker compose up -d ===')
print(out[-500:] if len(out) > 500 else out)
print(err[-500:] if len(err) > 500 else err)

stdin, stdout, stderr = ssh.exec_command('docker ps --format "table {{.Names}}\t{{.Status}}" 2>&1')
print('\n=== container status ===')
print(stdout.read().decode('utf-8', errors='replace'))

stdin, stdout, stderr = ssh.exec_command('curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health 2>&1')
print(f'Health: {stdout.read().decode("utf-8", errors="replace")}')

ssh.close()
