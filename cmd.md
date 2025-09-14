npx ppm batch --template proxy-clean --count 50 --prefix proxied --proxy-strategy round-robin --proxy-start "US2" --max-profiles-per-ip 5 --timeout 45000 --disable-images --resume

npx ppm batch --template direct-clean --count 5 --prefix direct --timeout 120000 --captcha-grace 45000 --delete-on-failure 

npx ppm batch --template proxy-clean --count 100 --prefix proxied --proxy-strategy round-robin --proxy-start "US1" --max-profiles-per-ip 5 --timeout 20000 --disable-images --resume --failure-delay 60 --delay 30

npx ppm batch --template proxy-clean --count 200 --prefix proxied --proxy-strategy round-robin --proxy-start "UK1" --max-profiles-per-ip 5 --timeout 45000 --disable-images --resume --failure-delay 90 --delay 60