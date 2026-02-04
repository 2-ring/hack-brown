# Calendar Integration - Next Steps

## ✅ Completed (Backend)

1. **Multi-provider calendar integration** - Microsoft Outlook and Apple Calendar
   - Modular architecture with google/, microsoft/, apple/ modules
   - Factory pattern for provider routing
   - Colocated token storage in provider_connections
   - All backend endpoints ready

2. **Authentication endpoints**
   - Microsoft OAuth connection
   - Apple CalDAV connection
   - Provider status checking

3. **Provider management endpoints**
   - List connected providers
   - Set primary calendar provider
   - Disconnect providers

## 🔨 To Do (Frontend)

1. **Sign-in buttons** - Add Microsoft and Apple buttons alongside Google
2. **Microsoft OAuth integration** - Use @azure/msal-browser library
3. **Apple Calendar connection modal** - Form for Apple ID + app-specific password
4. **Provider management UI** - Display connected providers, set primary, disconnect
5. **Update backend-client.ts** - Add API functions for new endpoints

## 📋 Azure Setup Required

Before Microsoft Calendar can be used:
1. Register app at [Azure Portal](https://portal.azure.com)
2. Get Client ID, Client Secret, Tenant ID
3. Add to `.env`:
   - `MICROSOFT_CLIENT_ID`
   - `MICROSOFT_CLIENT_SECRET`
   - `MICROSOFT_TENANT_ID=common`
4. Configure redirect URI

## 🎯 Personalization System (Future)

See [PERSONALIZATION_PLAN.md](PERSONALIZATION_PLAN.md) for full details on:
- Pattern discovery/analysis system (analyzes calendar history)
- Automatic pipeline integration (applies learned preferences)
- Multi-agent LLM approach for pattern discovery
- Frontend UI for preference management

**Key features**:
- Analyze user's calendar history to learn formatting patterns
- Auto-apply preferences to new events
- Pattern categories: titles, descriptions, colors, locations, durations, timing, calendar usage
- One-click analysis from UI (60-180 seconds)
