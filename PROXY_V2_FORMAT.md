# Proxy v2 Format and Enhanced Filtering

The Playwright Profile Manager now supports an enhanced proxy format (v2) with advanced filtering capabilities for connection types and countries.

## 🆕 What's New in v2 Format

### **Enhanced Proxy Structure**
- **Connection Type Filtering**: Filter by `resident`, `datacenter`, or `mobile` proxies
- **Country-Based Selection**: Filter by ISO country codes (`US`, `GB`, `DE`) or country names
- **Improved Metadata**: Rich proxy information including timezone, creation dates, and usage tracking
- **Backward Compatibility**: Automatic fallback to v1 format if v2 is not available

### **Key Benefits**
- **🏠 Residential vs Datacenter**: Choose proxy type based on your needs
- **🌍 Geographic Targeting**: Precise country-based proxy selection
- **🔄 Smart Rotation**: Enhanced rotation strategies with filtering
- **📊 Better Tracking**: Improved proxy usage and performance monitoring

## 📋 v2 Format Structure

### **Sample v2 Proxy Entry**
```json
{
    "_id": "89aec17b1a74ffc1036fffc9",
    "id": "89aec17b1a74ffc1036fffc9",
    "mode": "geolocation",
    "host": "geo.floppydata.com",
    "port": 10080,
    "username": "kNNvsbBulieuiY6i",
    "password": "zvvuztDlOHf4b75I",
    "profiles": [],
    "profilesCount": 1,
    "customName": "United States",
    "status": true,
    "country": "US",
    "checkDate": "2025-09-11T23:47:58.620Z",
    "createdAt": "2025-09-13T09:11:47.477Z",
    "connectionType": "resident",
    "timezone": "America/Los_Angeles"
}
```

### **Field Descriptions**

| Field | Type | Description |
|-------|------|-------------|
| `_id`/`id` | String | Unique identifier for the proxy |
| `host` | String | Proxy server hostname or IP address |
| `port` | Number | Proxy server port |
| `username` | String | Authentication username |
| `password` | String | Authentication password |
| `customName` | String | Human-readable name (e.g., "United States") |
| `country` | String | ISO country code (e.g., "US", "GB", "DE") |
| `connectionType` | String | Connection type: `resident`, `datacenter`, `mobile` |
| `status` | Boolean | Proxy status (true = working, false = not working) |
| `checkDate` | String | ISO timestamp of last status check |
| `mode` | String | Proxy mode (e.g., "geolocation") |
| `profiles` | Array | Associated profiles using this proxy |
| `profilesCount` | Number | Number of profiles using this proxy |
| `createdAt` | String | ISO timestamp of proxy creation |
| `timezone` | String | Timezone for the proxy location (optional) |

## 🎯 Connection Types

### **Resident Proxies**
- **Real residential IP addresses** from ISPs
- **Higher success rates** for most websites
- **Better for account creation** and sensitive operations
- **Slower speeds** but more authentic

### **Datacenter Proxies**
- **Datacenter IP addresses** from hosting providers
- **Faster speeds** and more reliable connections
- **Lower cost** and higher availability
- **May be detected** by some anti-bot systems

### **Mobile Proxies** (Future)
- **Mobile carrier IP addresses** from cellular networks
- **Highest success rates** for mobile-first platforms
- **Premium pricing** and limited availability
- **Best for mobile app automation**

## 🌍 Country Filtering

### **Supported Countries**
The system supports filtering by:
- **ISO Country Codes**: `US`, `GB`, `DE`, `FR`, `AU`, `CA`, `JP`, `NL`, `IT`, `ES`
- **Country Names**: `Germany`, `France`, `Australia`, etc.

### **Geographic Distribution**
Based on the current proxy pool:
- **🇺🇸 United States**: 57 proxies (46 resident, 11 datacenter)
- **🇬🇧 United Kingdom**: 23 proxies (all resident)
- **🇩🇪 Germany**: 23 proxies (all resident)
- **🇫🇷 France**: 29 proxies (23 resident, 6 datacenter)
- **🇦🇺 Australia**: 23 proxies (all resident)

## 🚀 Usage Examples

### **Basic Filtering**
```bash
# Use any US proxy
npx ppm launch my-profile --proxy-strategy auto --proxy-country US

# Use German datacenter proxies only
npx ppm launch my-profile --proxy-strategy auto --proxy-country DE --proxy-connection-type datacenter

# Use fastest resident proxy from any country
npx ppm launch my-profile --proxy-strategy fastest --proxy-connection-type resident
```

### **Batch Operations with Filtering**
```bash
# Batch with US resident proxies only
npx ppm batch --template vidiq-clean --count 10 \
    --proxy-strategy round-robin \
    --proxy-country US \
    --proxy-connection-type resident

# Batch with datacenter proxies for speed
npx ppm batch --template vidiq-clean --count 5 \
    --proxy-strategy fastest \
    --proxy-connection-type datacenter
```

### **Template Launch with Geographic Targeting**
```bash
# Launch template instances with German proxies
npx ppm launch-template vpn-fresh user1 \
    --proxy-strategy auto \
    --proxy-country DE

# Launch with UK resident proxies for authenticity
npx ppm launch-template vpn-fresh user2 \
    --proxy-strategy auto \
    --proxy-country GB \
    --proxy-connection-type resident
```

### **Account Refresh with Filtering**
```bash
# Refresh profiles using US resident proxies
npx ppm refresh --all --headless \
    --proxy-strategy round-robin \
    --proxy-country US \
    --proxy-connection-type resident

# Refresh with fastest datacenter proxies for speed
npx ppm refresh --prefix auto --limit 10 \
    --proxy-strategy fastest \
    --proxy-connection-type datacenter
```

## 🔧 Programmatic Usage

### **ProxyManager API**
```javascript
import { ProxyManager } from './src/ProxyManager.js';

const proxyManager = new ProxyManager();
await proxyManager.loadProxies();

// Get filtered proxies
const usResidentProxies = proxyManager.getFilteredProxies({
    type: 'http',
    country: 'US',
    connectionType: 'resident'
});

// Get proxy with filtering
const proxy = await proxyManager.getProxyConfig('auto', 'http', {
    country: 'DE',
    connectionType: 'datacenter'
});
```

### **ProxyRotator with Filtering**
```javascript
import { ProxyRotator } from './src/ProxyRotator.js';

const rotator = new ProxyRotator(proxyManager, {
    strategy: 'round-robin',
    proxyType: 'http',
    connectionType: 'resident',
    country: 'US',
    maxProfilesPerIP: 5
});

await rotator.initialize();
const { proxy, proxyConfig } = await rotator.getNextProxy();
```

## 🔄 Migration and Compatibility

### **Automatic Format Detection**
The system automatically:
1. **Checks for v2 format** (`http.proxies.v2.json`) first
2. **Falls back to v1 format** (`http.proxies.json`) if v2 not found
3. **Converts v2 to v1** internally for compatibility with existing code
4. **Preserves v2 metadata** for filtering capabilities

### **Manual Conversion**
Convert v2 format to v1 format manually:
```bash
# Convert v2 to v1 format
node convert-v2-to-v1-proxies.js ./proxies/http.proxies.v2.json ./proxies/http.proxies.converted.json

# Use converted file
mv ./proxies/http.proxies.converted.json ./proxies/http.proxies.json
```

### **Label Generation**
v2 proxies are automatically assigned labels based on:
- **Country name**: `US`, `Germany`, `France`, etc.
- **Sequential numbering**: `US1`, `US2`, `US3`, etc.
- **Connection type suffix**: `-DC` for datacenter proxies (e.g., `US1-DC`)

**Examples:**
- `US1` - First US resident proxy
- `US1-DC` - First US datacenter proxy
- `Germany5` - Fifth German resident proxy
- `France3-DC` - Third French datacenter proxy

## 📊 Enhanced Statistics

### **Connection Type Breakdown**
```bash
npx ppm proxy --list
# Shows proxies with connection type indicators:
# US1 [resident] (US) - geo.floppydata.com:10080
# US1-DC [datacenter] (US) - geo-dc.floppydata.com:10080
```

### **Filtering Statistics**
The system provides detailed statistics about:
- **Total proxies by type**: HTTP vs SOCKS5
- **Geographic distribution**: Proxies per country
- **Connection type distribution**: Resident vs datacenter vs mobile
- **Performance metrics**: Latency and success rates

## 🛠️ Advanced Configuration

### **Strategy + Filtering Combinations**

| Strategy | Connection Type | Country | Use Case |
|----------|----------------|---------|----------|
| `fastest` | `datacenter` | Any | High-speed automation |
| `auto` | `resident` | `US` | US account creation |
| `round-robin` | `resident` | Any | Distributed load, high success |
| `fastest` | `resident` | `DE` | German market testing |

### **Best Practices**

1. **Account Creation**: Use `resident` proxies for higher success rates
2. **High-Volume Operations**: Use `datacenter` proxies for speed
3. **Geographic Compliance**: Filter by specific countries for regional testing
4. **Load Distribution**: Use `round-robin` with filtering for even distribution
5. **Performance Critical**: Use `fastest` strategy with appropriate filters

## 🔍 Troubleshooting

### **No Proxies Found**
If you get "No proxy found" errors:
1. **Check filters**: Ensure your filtering criteria match available proxies
2. **Verify format**: Confirm v2 format file exists and is valid JSON
3. **Check status**: Ensure proxies have `status: true` in v2 format
4. **Review logs**: Check console output for filtering details

### **Filtering Not Working**
If filtering doesn't work as expected:
1. **Use exact values**: Country codes are case-sensitive (`US` not `us`)
2. **Check connection types**: Use exact values: `resident`, `datacenter`, `mobile`
3. **Verify proxy data**: Ensure proxies have the required fields
4. **Test individually**: Use `--test` command to verify specific filters

### **Performance Issues**
If proxy selection is slow:
1. **Use specific filters**: Narrow down the proxy pool with filters
2. **Skip IP checks**: Use `--skip-ip-check` for faster selection
3. **Prefer datacenter**: Use `--proxy-connection-type datacenter` for speed
4. **Cache results**: The system caches proxy data for better performance

## 🎉 Migration Complete

Your HTTP proxy system has been successfully updated to support the new v2 format with:

✅ **Automatic v2 format loading**  
✅ **Connection type filtering** (`resident`, `datacenter`, `mobile`)  
✅ **Country-based filtering** (ISO codes and names)  
✅ **Enhanced CLI commands** with new filtering options  
✅ **Backward compatibility** with existing v1 format  
✅ **Migration utilities** for format conversion  
✅ **Comprehensive testing** and validation  

The system now provides much more granular control over proxy selection, enabling better automation workflows and improved success rates for different use cases.