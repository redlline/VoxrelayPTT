import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('119.235.120.28', port=8222, username='root', password='vpspassword12wq', timeout=30)

stdin, stdout, stderr = ssh.exec_command('docker ps --format "{{.Names}} {{.Status}}"', timeout=10)
print(stdout.read().decode('utf-8'))

# Check logs for errors
stdin, stdout, stderr = ssh.exec_command('docker logs --tail 30 ptt-voxrelay-server-1 2>&1', timeout=10)
print('\n--- Last 30 logs ---')
print(stdout.read().decode('utf-8', errors='replace'))

ssh.close()
