# VidIQ Extension Authentication Analysis

## Overview
Analysis of captured HTTP requests from VidIQ extension during login flow, showing complete authentication tokens and API usage patterns.

## Key Authentication Tokens Discovered

### 1. **VidIQ Extension Identification**
- **x-vidiq-client**: `ext vch/3.151.0` (Extension Version)
- **x-vidiq-device-id**: `2ea4752a-6972-4bf1-9376-9d75f62354c7`

### 2. **Session Tokens**
- **Primary Session Token**: `UKP!fa527378-8f02-42eb-a218-684451da6e82!6777d813-642b-4d5e-b724-6c217be5242f`
- **Account ID**: `fa527378-8f02-42eb-a218-684451da6e82`
- **Session ID**: `6777d813-642b-4d5e-b724-6c217be5242f`

### 3. **JWT Tokens (RS512 Algorithm)**

#### **Main JWT Access Token**:
```
eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzUxMiIsImtpZCI6IjZiNjk5ZDc4LWE0NDEtNGUyZC1iMTY2LTJiZjc4NDM5Y2Y5MSJ9.eyJpc3MiOiJodHRwczovL2FjY291bnQudmlkaXEuY29tIiwic3ViIjoiZmE1MjczNzgtOGYwMi00MmViLWEyMTgtNjg0NDUxZGE2ZTgyIiwiYXVkIjoidmlkaXEtYXBpIiwiZXhwIjoxNzU3NDg5MDkzLCJpYXQiOjE3NTc0ODg0OTMsImp0aSI6ImVhOTZjMDc4LWRkNTYtNGRkNC04ODU3LWRjZWI2NmY4MWU0NSIsInVzZXIiOnsiaWQiOiJmYTUyNzM3OC04ZjAyLTQyZWItYTIxOC02ODQ0NTFkYTZlODIiLCJtaWQiOiI2OGMxMjU2Y2MwYjE5NDI3NDRjNzM0MzkiLCJlbWFpbCI6Im5pa29sYXphamFjMTQ4NkBtYWlsLmNvbSIsInJvbGUiOiJ1c2VyIiwic2Vzc2lvbl9pZCI6ImVhOTZjMDc4LWRkNTYtNGRkNC04ODU3LWRjZWI2NmY4MWU0NSJ9fQ.Q38KQ2JQ6_tbTp-ZeY7bhHh4rm9e3iO6WEI7CJIvBNx-OZA_ezOAZfH0uaAK9gyhmLTPs_FV7i2VF0fu_Vh4JpJsUHEH92e24kyPVYMPuhbVysRo0IJlqKBqGuFRVPDFWUwMgXMbQNb0zjbBOgjULtJYbBTW3-hu1b-ebGdu9hq9hSO6r2dvQRHn4VrJdByXWEaSBc2wzJo6QOLGZVTHZiTcJDe_FlfIlGWOmk06HdKNrHaIhuYkMdnFnm2zdp77g26EUb7mxCckFK9WJFGvwVFc9dDk173D-m6brBMFVEJsI-Mby2bNPI_30c49dPpT5yKeGdu9DVb-cWchTYa5FA
```

**Decoded JWT Payload:**
```json
{
  "iss": "https://account.vidiq.com",
  "sub": "fa527378-8f02-42eb-a218-684451da6e82",
  "aud": "vidiq-api",
  "exp": 1757489093,
  "iat": 1757488493,
  "jti": "ea96c078-dd56-4dd4-8857-dceb66f81e45",
  "user": {
    "id": "fa527378-8f02-42eb-a218-684451da6e82",
    "mid": "68c1256cc0b1942744c73439",
    "email": "nikolazajac1486@mail.com",
    "role": "user",
    "session_id": "ea96c078-dd56-4dd4-8857-dceb66f81e45"
  }
}
```

#### **Refresh Token**:
```
zx8SLv2Tn3f9TX8vWSlMHFylSk6MhtqcMJi828tA8wJh3WXpbobsWLpir7mdArP0QGP1s1Lb.ubAKXOpR
```

## Authentication Flow Analysis

### 1. **Initial Signup Request**
- **URL**: `https://api.vidiq.com/auth/signup`
- **Method**: POST
- **Client**: `ext vch/3.151.0` (Extension)
- **Credentials**: Email + Password + CAPTCHA
- **Email**: `nikolazajac1486@mail.com`
- **Password**: `T^m0oo!Bgjp7{N`

### 2. **Immediate Login Request**
- **URL**: `https://api.vidiq.com/auth/login` 
- **Method**: POST
- **Same credentials as signup**
- **Returns**: Complete JWT + Session tokens

### 3. **Post-Login Authentication Headers**

#### **Bearer Token Authorization**:
```
Authorization: Bearer UKP!fa527378-8f02-42eb-a218-684451da6e82!6777d813-642b-4d5e-b724-6c217be5242f
```

#### **JWT Authentication**:
```
x-vidiq-auth: [Full JWT Token]
```

## Post-Login API Requests

### **Authenticated Endpoints Used:**
1. `GET /auth/user` - User profile verification
2. `GET /user/channels` - User's YouTube channels
3. `GET /subscriptions/active` - Active subscriptions
4. `GET /subscriptions/plans/available/authed-smart` - Available plans
5. `POST /experimentation/batch-by-keys` - Feature flags/experiments

## Client Type Detection

### **Extension vs Web Detection:**
- **Extension requests**: `x-vidiq-client: ext vch/3.151.0`
- **Web requests**: `x-vidiq-client: web 61b61ab9f9900c18d51c0605348e4169a6480e95`

The system clearly identifies when requests come from the browser extension vs the web application.

## User Profile Information
- **Account ID**: `fa527378-8f02-42eb-a218-684451da6e82`
- **MongoDB ID**: `68c1256cc0b1942744c73439`
- **Email**: `nikolazajac1486@mail.com`
- **Role**: `user`
- **Account Type**: Basic (no premium subscriptions)
- **New User**: Yes (from signup response)

## Key Observations

1. **Dual Authentication**: VidIQ uses both Bearer tokens and JWT tokens simultaneously
2. **Extension Integration**: Clear distinction between extension and web requests
3. **Complete Flow Captured**: From signup through authenticated API calls
4. **Device Tracking**: Unique device ID maintained across requests
5. **Session Management**: Multiple session IDs for different purposes
6. **Feature Flags**: Extensive experimentation system with 60+ feature flags

## Security Implementation
- **JWT Algorithm**: RS512 (Strong asymmetric encryption)
- **Token Expiration**: ~10 minutes (600 seconds)
- **Refresh Token**: Available for token renewal
- **Device Fingerprinting**: Persistent device ID tracking
- **CAPTCHA Protection**: Required for signup/login

This capture provides complete authentication credentials needed to interact with VidIQ's API as an authenticated extension user.
