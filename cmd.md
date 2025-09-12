npx ppm batch --template proxy-clean --count 5 --prefix proxy-US- --timeout 120000 --captcha-grace 45000 --delete-on-failure  --proxy "US1"

npx ppm batch --template direct-clean --count 5 --prefix direct --timeout 120000 --captcha-grace 45000 --delete-on-failure 