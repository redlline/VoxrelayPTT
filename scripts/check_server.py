import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('119.235.120.28', port=8222, username='root', password='vpspassword12wq')

stdin, stdout, stderr = ssh.exec_command('cat /opt/ptt/.env | grep -E "TURN|STUN|MEDIASOUP"')
print('=== .env TURN/STUN vars ===')
print(stdout.read().decode('utf-8', errors='replace'))

stdin, stdout, stderr = ssh.exec_command('docker ps --filter name=coturn --format "{{.Names}} {{.Status}}"')
print('\n=== coturn status ===')
print(stdout.read().decode('utf-8', errors='replace'))

stdin, stdout, stderr = ssh.exec_command('docker logs ptt-coturn-1 --tail 20 2>&1')
print('=== coturn logs ===')
print(stdout.read().decode('utf-8', errors='replace'))

stdin, stdout, stderr = ssh.exec_command('curl -s http://localhost:3000/api/v1/sfu/config')
print('\n=== /sfu/config response ===')
print(stdout.read().decode('utf-8', errors='replace'))

ssh.close()
