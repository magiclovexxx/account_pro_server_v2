import { Client } from 'ssh2';

const conn = new Client();

const fixNginxCorsScript = `
echo "=== 1. PULLING LATEST SERVER CODE ==="
cd /home/account_pro_server_v2
git pull origin main
pm2 restart account_pro_server

echo "=== 2. UPDATING /etc/nginx/conf.d/account.pro.vn.conf ==="
cat << 'EOF' > /etc/nginx/conf.d/account.pro.vn.conf
# ============== HTTPS (443) ==============
server {
    server_name account.pro.vn www.account.pro.vn;
    root /home/account_pro_v2/dist;
    index index.html;
    client_max_body_size 2000M;
    proxy_connect_timeout 300s;
    proxy_send_timeout    300s;
    proxy_read_timeout    300s;
    send_timeout          300s;

    # ------------------ SPA Frontend ------------------
    location / {
        try_files $uri $uri/ /index.html;
    }

    # ------------------ API Node.js (PostgreSQL) ------------------
    location /api {
        proxy_pass http://127.0.0.1:6789;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # ------------------ API Python (MỚI) ------------------
    location /python-api/ {
        proxy_pass http://127.0.0.1:5000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # ------------------ SSL Config ------------------
    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/account.pro.vn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/account.pro.vn/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

# ============== HTTP → HTTPS Redirect ==============
server {
    if ($host = account.pro.vn) {
        return 301 https://$host$request_uri;
    }

    listen 80;
    server_name account.pro.vn www.account.pro.vn;
    return 404;
}
EOF

echo "=== 3. UPDATING /etc/nginx/conf.d/ads.kingoftool.net.conf ==="
cat << 'EOF' > /etc/nginx/conf.d/ads.kingoftool.net.conf
server {
    server_name ads.kingoftool.net;

    root /home/account_pro_v2/dist;
    index index.html;

    client_max_body_size 2000M;
    proxy_connect_timeout 300s;
    proxy_send_timeout    300s;
    proxy_read_timeout    300s;
    send_timeout          300s;

    # ------------------ SPA Frontend ------------------
    location / {
        try_files $uri $uri/ /index.html;
    }

    # ------------------ API Node.js (PostgreSQL) ------------------
    location /api {
        proxy_pass http://127.0.0.1:6789;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # ------------------ API Python (GAM) ------------------
    location /python-api/ {
        proxy_pass http://127.0.0.1:5000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/ads.kingoftool.net/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/ads.kingoftool.net/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
}

server {
    if ($host = ads.kingoftool.net) {
        return 301 https://$host$request_uri;
    } # managed by Certbot

    listen 80;
    server_name ads.kingoftool.net;
    return 404; # managed by Certbot
}
EOF

echo "=== 4. TESTING AND RELOADING NGINX ==="
nginx -t
systemctl reload nginx
echo "✅ Nginx reloaded successfully!"

echo "=== 5. TESTING CORS FROM ads.kingoftool.net TO account.pro.vn ==="
curl -i -X OPTIONS https://account.pro.vn/api/auth/login \
  -H "Origin: https://ads.kingoftool.net" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type, Authorization"

echo -e "\n\n=== 6. TESTING CORS FROM localhost:5173 TO ads.kingoftool.net ==="
curl -i -X OPTIONS https://ads.kingoftool.net/api/auth/login \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type, Authorization"
`;

conn.on('ready', () => {
    conn.exec(fixNginxCorsScript, (err, stream) => {
        if (err) throw err;
        let output = '';
        stream.on('close', (code, signal) => {
            console.log(output);
            conn.end();
            process.exit(code || 0);
        }).on('data', (data) => {
            process.stdout.write(data.toString());
        }).stderr.on('data', (data) => {
            process.stderr.write(data.toString());
        });
    });
}).connect({
    host: '42.96.15.241',
    port: 26266,
    username: 'root',
    password: 'Xij:^_^8!',
    readyTimeout: 30000
});
