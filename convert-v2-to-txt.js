import fs from 'fs';
import path from 'path';

const inputFile = 'proxies/http.proxies.v2.json';
const outputFile = 'proxies/http.proxies.txt';

try {
  // Read and parse the JSON file
  const data = fs.readFileSync(inputFile, 'utf8');
  const proxies = JSON.parse(data);

  // Filter proxies with status = true and format them
  const formattedProxies = proxies
    .filter(proxy => proxy.status === true)
    .map(proxy => `${proxy.host}:${proxy.port}:${proxy.username}:${proxy.password}`);

  // Write to txt file
  fs.writeFileSync(outputFile, formattedProxies.join('\n'), 'utf8');

  console.log(`Converted ${formattedProxies.length} proxies to ${outputFile}`);
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}