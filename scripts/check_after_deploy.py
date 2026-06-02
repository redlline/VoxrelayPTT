import paramiko, time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('119.235.120.28', port=8222, username='root', password='vpspassword12wq')

# Check if services are running 
stdin, stdout, stderr = ssh.exec_command('docker ps --format "table {{.Names}}\t{{.Status}}" 2>&1')
print('=== container status ===')
print(stdout.read().decode('utf-8', errors='replace'))

# Check if the new image was built
stdin, stdout, stderr = ssh.exec_command('docker images ptt-voxrelay-server --format "{{.Repository}}:{{.Tag}} {{.CreatedAt}}" 2>&1')
print('\n=== image ===')
print(stdout.read().decode('utf-8', errors='replace'))

# Check if the new JS files are served
stdin, stdout, stderr = ssh.exec_command('ls -la /opt/ptt/apps/web/dist/assets/ 2>&1 | grep index')
print('\n=== frontend assets ===')
print(stdout.read().decode('utf-8', errors='replace'))

ssh.close()
