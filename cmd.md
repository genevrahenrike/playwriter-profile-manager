npx ppm batch --template proxy-clean --count 50 --prefix proxied --proxy-strategy round-robin --proxy-start "US2" --max-profiles-per-ip 5 --timeout 45000 --disable-images --resume

npx ppm batch --template direct-clean --count 5 --prefix direct --timeout 120000 --captcha-grace 45000 --delete-on-failure 

npx ppm batch --template proxy-clean --count 100 --prefix proxied --proxy-strategy round-robin --proxy-start "US1" --max-profiles-per-ip 5 --timeout 20000 --disable-images --resume --failure-delay 60 --delay 30

npx ppm batch --template proxy-clean --count 250 --prefix proxied --proxy-strategy round-robin --proxy-start "UK3" --max-profiles-per-ip 5 --timeout 60000 --disable-images --resume --failure-delay 60 --delay 60

npx ppm batch --template proxy-clean --count 200 --prefix proxied --proxy-strategy round-robin --proxy-connection-type datacenter --max-profiles-per-ip 5 --timeout 60000 --disable-images --resume --failure-delay 30 --delay 30