import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('119.235.120.28', port=8222, username='root', password='vpspassword12wq')

stdin, stdout, stderr = ssh.exec_command("docker images ptt-voxrelay-server --format '{{.Repository}}:{{.Tag}} {{.CreatedAt}}' 2>&1")
print('=== docker images ===')
print(stdout.read().decode('utf-8', errors='replace'))

stdin, stdout, stderr = ssh.exec_command("grep 'DELETE FROM' /opt/ptt/services/api-gateway/src/routes/messages.ts 2>&1")
print('=== backend code (delete endpoint) ===')
print(stdout.read().decode('utf-8', errors='replace'))

stdin, stdout, stderr = ssh.exec_command("ls -la /opt/ptt/apps/web/dist/assets/ | grep index.*.js 2>&1")
print('=== frontend assets ===')
print(stdout.read().decode('utf-8', errors='replace'))

ssh.close()
