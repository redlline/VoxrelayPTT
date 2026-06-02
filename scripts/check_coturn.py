import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('119.235.120.28', port=8222, username='root', password='vpspassword12wq')

stdin, stdout, stderr = ssh.exec_command('docker logs ptt-coturn-1 --tail 30 2>&1')
print('=== coturn logs ===')
print(stdout.read().decode('utf-8', errors='replace'))

stdin, stdout, stderr = ssh.exec_command('docker exec ptt-coturn-1 sh -c "ps aux | grep turnserver" 2>&1')
print('\n=== coturn process ===')
print(stdout.read().decode('utf-8', errors='replace'))

stdin, stdout, stderr = ssh.exec_command('docker inspect ptt-coturn-1 --format "{{json .Config.Cmd}}" 2>&1')
print('\n=== coturn command ===')
print(stdout.read().decode('utf-8', errors='replace'))

stdin, stdout, stderr = ssh.exec_command('docker inspect ptt-coturn-1 --format "{{json .HostConfig.PortBindings}}" 2>&1')
print('\n=== coturn ports ===')
print(stdout.read().decode('utf-8', errors='replace'))

ssh.close()
