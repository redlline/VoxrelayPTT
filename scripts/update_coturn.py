import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('119.235.120.28', port=8222, username='root', password='vpspassword12wq')
sftp = ssh.open_sftp()
sftp.put(r'C:\Users\User\Desktop\ptt\docker-compose.yml', '/opt/ptt/docker-compose.yml')
sftp.close()

stdin, stdout, stderr = ssh.exec_command('cd /opt/ptt && docker compose up -d coturn 2>&1')
out = stdout.read().decode('utf-8', errors='replace')
err = stderr.read().decode('utf-8', errors='replace')
print('=== docker compose up -d coturn ===')
print(out)
print(err)

stdin, stdout, stderr = ssh.exec_command("docker exec ptt-coturn-1 ps aux | grep turnserver 2>&1")
print('\n=== coturn process ===')
print(stdout.read().decode('utf-8', errors='replace'))

ssh.close()
