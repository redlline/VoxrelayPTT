import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('119.235.120.28', port=8222, username='root', password='vpspassword12wq', timeout=30)

stdin, stdout, stderr = ssh.exec_command('docker ps --format "{{.Names}} {{.Status}}"', timeout=10)
print(stdout.read().decode())
ssh.close()
