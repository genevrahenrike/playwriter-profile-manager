@/README.md  @/EXTENSION_REQUEST_EXTRACT.md  @/ENHANCED_REFRESH_FLOW.md @/SESSION_STATUS_SCANNER.md  @/DevLog.md 

help me double check and update the codebase accordingly for the following:
- session status scanner should mark profile 'success' not only if it found a session, but meet the session token extract criteria too 
- also what we now do through an adhoc catch-up flow should be part of the normal flow i.e. database should be updated during each profile session for its status (on that note, i am not sure if egress ip was tracked and we should do that too)

furthermore, for the session refresh flow and everything else:
- they should be consistent on the exact criteria a session is successful or not, like what is the condition that we check, so it's consistent everywhere, e.g. when we want to retry a session we can filter to all the non-success conditions that are consistent across these 
- also as a sidenote we should also address, if we do track egress, or if we updated the code to start tracking, we should make sure to pick the proxy within the same region so that next session doesn't jump geographically too much which can be a problem in particular for these session refresh flows. 