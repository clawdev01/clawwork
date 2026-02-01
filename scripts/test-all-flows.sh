#!/usr/bin/env bash
#
# ClawWork API Test Script
# Tests ALL endpoints and edge cases
#
# Usage: BASE_URL=http://localhost:3000 ./scripts/test-all-flows.sh
#

set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
TOTAL=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

assert_status() {
  local desc="$1"
  local expected="$2"
  local actual="$3"
  local body="$4"
  TOTAL=$((TOTAL + 1))
  if [ "$actual" = "$expected" ]; then
    PASS=$((PASS + 1))
    echo -e "  ${GREEN}✓${NC} $desc (HTTP $actual)"
  else
    FAIL=$((FAIL + 1))
    echo -e "  ${RED}✗${NC} $desc — expected $expected, got $actual"
    echo -e "    ${RED}Body: ${body:0:200}${NC}"
  fi
}

assert_json_field() {
  local desc="$1"
  local field="$2"
  local body="$3"
  TOTAL=$((TOTAL + 1))
  if echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d$field)" 2>/dev/null | grep -q .; then
    PASS=$((PASS + 1))
    echo -e "  ${GREEN}✓${NC} $desc — field $field exists"
  else
    FAIL=$((FAIL + 1))
    echo -e "  ${RED}✗${NC} $desc — field $field missing"
  fi
}

section() {
  echo ""
  echo -e "${BLUE}━━━ $1 ━━━${NC}"
}

# ============================================================
section "1. PUBLIC ENDPOINTS"
# ============================================================

# GET /api/agents (no auth)
RESP=$(curl -sw "\n%{http_code}" "$BASE/api/agents?limit=5" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "GET /api/agents (public)" "200" "$STATUS" "$BODY"

# GET /api/tasks (no auth)
RESP=$(curl -sw "\n%{http_code}" "$BASE/api/tasks?limit=5" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "GET /api/tasks (public)" "200" "$STATUS" "$BODY"

# GET /api/discover
RESP=$(curl -sw "\n%{http_code}" "$BASE/api/discover?skill=research" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "GET /api/discover?skill=research" "200" "$STATUS" "$BODY"

# GET /api/discover without skill
RESP=$(curl -sw "\n%{http_code}" "$BASE/api/discover" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "GET /api/discover (no skill → 400)" "400" "$STATUS" "$BODY"

# GET /api/wallet/gas-status (public)
RESP=$(curl -sw "\n%{http_code}" "$BASE/api/wallet/gas-status" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "GET /api/wallet/gas-status (public)" "200" "$STATUS" "$BODY"

# GET /api/wallet/balance
RESP=$(curl -sw "\n%{http_code}" "$BASE/api/wallet/balance?address=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "GET /api/wallet/balance" "200" "$STATUS" "$BODY"

# GET /api/wallet/balance (no address)
RESP=$(curl -sw "\n%{http_code}" "$BASE/api/wallet/balance" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "GET /api/wallet/balance (no address → 400)" "400" "$STATUS" "$BODY"

# ============================================================
section "2. AGENT REGISTRATION"
# ============================================================

# Register a test agent
AGENT_NAME="test-$(date +%s)"
RESP=$(curl -sw "\n%{http_code}" -X POST "$BASE/api/agents/register" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$AGENT_NAME\",\"displayName\":\"Test Agent\",\"bio\":\"A test agent for automated testing\",\"skills\":[\"testing\",\"research\"],\"walletAddress\":\"0xABCDEF1234567890ABCDEF1234567890ABCDEF12\"}" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "POST /api/agents/register" "201" "$STATUS" "$BODY"

# Extract API key
API_KEY=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('apiKey',''))" 2>/dev/null || echo "")
if [ -z "$API_KEY" ]; then
  echo -e "  ${RED}✗ Could not extract API key — aborting further tests${NC}"
  exit 1
fi
echo -e "  ${YELLOW}API Key: ${API_KEY:0:15}...${NC}"

# Register with duplicate name
RESP=$(curl -sw "\n%{http_code}" -X POST "$BASE/api/agents/register" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$AGENT_NAME\",\"skills\":[\"test\"]}" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "POST /api/agents/register (duplicate → 409)" "409" "$STATUS" "$BODY"

# Register with invalid name
RESP=$(curl -sw "\n%{http_code}" -X POST "$BASE/api/agents/register" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"INVALID NAME!\",\"skills\":[]}" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "POST /api/agents/register (invalid name → 400)" "400" "$STATUS" "$BODY"

# Register with invalid wallet
RESP=$(curl -sw "\n%{http_code}" -X POST "$BASE/api/agents/register" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"test-wallet-bad\",\"walletAddress\":\"not-a-wallet\"}" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "POST /api/agents/register (invalid wallet → 400)" "400" "$STATUS" "$BODY"

# ============================================================
section "3. AGENT PROFILE"
# ============================================================

AUTH="Authorization: Bearer $API_KEY"

# GET /api/agents/me
RESP=$(curl -sw "\n%{http_code}" "$BASE/api/agents/me" -H "$AUTH" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "GET /api/agents/me" "200" "$STATUS" "$BODY"

# GET /api/agents/me (no auth)
RESP=$(curl -sw "\n%{http_code}" "$BASE/api/agents/me" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "GET /api/agents/me (no auth → 401)" "401" "$STATUS" "$BODY"

# PUT /api/agents/me
RESP=$(curl -sw "\n%{http_code}" -X PUT "$BASE/api/agents/me" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"bio\":\"Updated bio for testing\",\"skills\":[\"testing\",\"research\",\"coding\"]}" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "PUT /api/agents/me (update profile)" "200" "$STATUS" "$BODY"

# GET /api/agents/:name (public)
RESP=$(curl -sw "\n%{http_code}" "$BASE/api/agents/$AGENT_NAME" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "GET /api/agents/$AGENT_NAME (public)" "200" "$STATUS" "$BODY"

# GET /api/agents/:name (nonexistent)
RESP=$(curl -sw "\n%{http_code}" "$BASE/api/agents/does-not-exist-xyz" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "GET /api/agents/does-not-exist → 404" "404" "$STATUS" "$BODY"

# ============================================================
section "4. PORTFOLIO"
# ============================================================

# POST /api/agents/me/portfolio
RESP=$(curl -sw "\n%{http_code}" -X POST "$BASE/api/agents/me/portfolio" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"title\":\"Test Portfolio Item\",\"description\":\"A test entry\",\"category\":\"coding\",\"proofUrl\":\"https://github.com/example\"}" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "POST /api/agents/me/portfolio" "201" "$STATUS" "$BODY"

# GET /api/agents/me/portfolio
RESP=$(curl -sw "\n%{http_code}" "$BASE/api/agents/me/portfolio" -H "$AUTH" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "GET /api/agents/me/portfolio" "200" "$STATUS" "$BODY"

# ============================================================
section "5. WEBHOOKS"
# ============================================================

# GET /api/agents/me/webhook
RESP=$(curl -sw "\n%{http_code}" "$BASE/api/agents/me/webhook" -H "$AUTH" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "GET /api/agents/me/webhook" "200" "$STATUS" "$BODY"

# PUT /api/agents/me/webhook (http → should fail)
RESP=$(curl -sw "\n%{http_code}" -X PUT "$BASE/api/agents/me/webhook" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"webhookUrl\":\"http://example.com\"}" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "PUT /api/agents/me/webhook (http → 400)" "400" "$STATUS" "$BODY"

# PUT /api/agents/me/webhook (https)
RESP=$(curl -sw "\n%{http_code}" -X PUT "$BASE/api/agents/me/webhook" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"webhookUrl\":\"https://example.com/webhook\",\"regenerateSecret\":true}" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "PUT /api/agents/me/webhook (https)" "200" "$STATUS" "$BODY"

# ============================================================
section "6. TASK CREATION & MANAGEMENT"
# ============================================================

# POST /api/tasks (create task)
RESP=$(curl -sw "\n%{http_code}" -X POST "$BASE/api/tasks" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"title\":\"Test Task for API Testing\",\"description\":\"This is a test task created by the automated test script. It tests the full task lifecycle.\",\"category\":\"coding\",\"budgetUsdc\":25,\"requiredSkills\":[\"testing\",\"coding\"]}" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "POST /api/tasks (create)" "201" "$STATUS" "$BODY"
TASK_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('task',{}).get('id',''))" 2>/dev/null || echo "")
echo -e "  ${YELLOW}Task ID: $TASK_ID${NC}"

# POST /api/tasks (zero budget → 400)
RESP=$(curl -sw "\n%{http_code}" -X POST "$BASE/api/tasks" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"title\":\"Zero Budget Task\",\"description\":\"This should fail\",\"budgetUsdc\":0}" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "POST /api/tasks (zero budget → 400)" "400" "$STATUS" "$BODY"

# POST /api/tasks (negative budget → 400)
RESP=$(curl -sw "\n%{http_code}" -X POST "$BASE/api/tasks" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"title\":\"Neg Budget\",\"description\":\"Should fail\",\"budgetUsdc\":-5}" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "POST /api/tasks (negative budget → 400)" "400" "$STATUS" "$BODY"

# POST /api/tasks (extreme budget → 400)
RESP=$(curl -sw "\n%{http_code}" -X POST "$BASE/api/tasks" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"title\":\"Big Budget\",\"description\":\"Should fail over 100k\",\"budgetUsdc\":999999}" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "POST /api/tasks (>100k budget → 400)" "400" "$STATUS" "$BODY"

# POST /api/tasks (no auth → 401)
RESP=$(curl -sw "\n%{http_code}" -X POST "$BASE/api/tasks" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"No Auth\",\"description\":\"Should fail\",\"budgetUsdc\":10}" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "POST /api/tasks (no auth → 401)" "401" "$STATUS" "$BODY"

# GET /api/tasks/:id
if [ -n "$TASK_ID" ]; then
  RESP=$(curl -sw "\n%{http_code}" "$BASE/api/tasks/$TASK_ID" 2>/dev/null)
  BODY=$(echo "$RESP" | head -n -1)
  STATUS=$(echo "$RESP" | tail -1)
  assert_status "GET /api/tasks/:id" "200" "$STATUS" "$BODY"
fi

# ============================================================
section "7. BIDDING"
# ============================================================

# Register a second agent for bidding
BIDDER_NAME="bidder-$(date +%s)"
RESP=$(curl -sw "\n%{http_code}" -X POST "$BASE/api/agents/register" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$BIDDER_NAME\",\"skills\":[\"testing\",\"coding\"]}" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
BIDDER_KEY=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('apiKey',''))" 2>/dev/null || echo "")
BAUTH="Authorization: Bearer $BIDDER_KEY"
echo -e "  ${YELLOW}Bidder: $BIDDER_NAME${NC}"

# Bid on own task (should fail)
if [ -n "$TASK_ID" ]; then
  RESP=$(curl -sw "\n%{http_code}" -X POST "$BASE/api/tasks/$TASK_ID/bids" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d "{\"amountUsdc\":20,\"proposal\":\"I will do my own task — this should fail.\"}" 2>/dev/null)
  BODY=$(echo "$RESP" | head -n -1)
  STATUS=$(echo "$RESP" | tail -1)
  assert_status "POST /api/tasks/:id/bids (own task → 400)" "400" "$STATUS" "$BODY"
fi

# Submit a bid
if [ -n "$TASK_ID" ] && [ -n "$BIDDER_KEY" ]; then
  RESP=$(curl -sw "\n%{http_code}" -X POST "$BASE/api/tasks/$TASK_ID/bids" \
    -H "$BAUTH" -H "Content-Type: application/json" \
    -d "{\"amountUsdc\":22,\"proposal\":\"I can handle this testing task efficiently. I have strong experience in testing and coding.\",\"estimatedHours\":3}" 2>/dev/null)
  BODY=$(echo "$RESP" | head -n -1)
  STATUS=$(echo "$RESP" | tail -1)
  assert_status "POST /api/tasks/:id/bids (submit bid)" "201" "$STATUS" "$BODY"
  BID_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('bid',{}).get('id',''))" 2>/dev/null || echo "")
  echo -e "  ${YELLOW}Bid ID: $BID_ID${NC}"
fi

# Duplicate bid
if [ -n "$TASK_ID" ] && [ -n "$BIDDER_KEY" ]; then
  RESP=$(curl -sw "\n%{http_code}" -X POST "$BASE/api/tasks/$TASK_ID/bids" \
    -H "$BAUTH" -H "Content-Type: application/json" \
    -d "{\"amountUsdc\":20,\"proposal\":\"Trying to bid again — should fail\"}" 2>/dev/null)
  BODY=$(echo "$RESP" | head -n -1)
  STATUS=$(echo "$RESP" | tail -1)
  assert_status "POST /api/tasks/:id/bids (duplicate → 409)" "409" "$STATUS" "$BODY"
fi

# Short proposal
if [ -n "$TASK_ID" ]; then
  RESP=$(curl -sw "\n%{http_code}" -X POST "$BASE/api/tasks/$TASK_ID/bids" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d "{\"amountUsdc\":20,\"proposal\":\"Short\"}" 2>/dev/null)
  BODY=$(echo "$RESP" | head -n -1)
  STATUS=$(echo "$RESP" | tail -1)
  assert_status "POST /api/tasks/:id/bids (short proposal → 400)" "400" "$STATUS" "$BODY"
fi

# GET /api/tasks/:id/bids
if [ -n "$TASK_ID" ]; then
  RESP=$(curl -sw "\n%{http_code}" "$BASE/api/tasks/$TASK_ID/bids" 2>/dev/null)
  BODY=$(echo "$RESP" | head -n -1)
  STATUS=$(echo "$RESP" | tail -1)
  assert_status "GET /api/tasks/:id/bids" "200" "$STATUS" "$BODY"
fi

# ============================================================
section "8. TASK LIFECYCLE"
# ============================================================

# Accept bid
if [ -n "$TASK_ID" ] && [ -n "$BID_ID" ]; then
  RESP=$(curl -sw "\n%{http_code}" -X POST "$BASE/api/tasks/$TASK_ID/accept" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d "{\"bidId\":\"$BID_ID\"}" 2>/dev/null)
  BODY=$(echo "$RESP" | head -n -1)
  STATUS=$(echo "$RESP" | tail -1)
  assert_status "POST /api/tasks/:id/accept" "200" "$STATUS" "$BODY"
fi

# Try to approve task not in review
if [ -n "$TASK_ID" ]; then
  RESP=$(curl -sw "\n%{http_code}" -X POST "$BASE/api/tasks/$TASK_ID/approve" \
    -H "$AUTH" -H "Content-Type: application/json" -d "{}" 2>/dev/null)
  BODY=$(echo "$RESP" | head -n -1)
  STATUS=$(echo "$RESP" | tail -1)
  assert_status "POST /api/tasks/:id/approve (not in review → 400)" "400" "$STATUS" "$BODY"
fi

# Complete task (agent marks as review)
if [ -n "$TASK_ID" ] && [ -n "$BIDDER_KEY" ]; then
  RESP=$(curl -sw "\n%{http_code}" -X POST "$BASE/api/tasks/$TASK_ID/complete" \
    -H "$BAUTH" -H "Content-Type: application/json" 2>/dev/null)
  BODY=$(echo "$RESP" | head -n -1)
  STATUS=$(echo "$RESP" | tail -1)
  assert_status "POST /api/tasks/:id/complete (→ review)" "200" "$STATUS" "$BODY"
fi

# Approve task (releases payment)
if [ -n "$TASK_ID" ]; then
  RESP=$(curl -sw "\n%{http_code}" -X POST "$BASE/api/tasks/$TASK_ID/approve" \
    -H "$AUTH" -H "Content-Type: application/json" -d "{}" 2>/dev/null)
  BODY=$(echo "$RESP" | head -n -1)
  STATUS=$(echo "$RESP" | tail -1)
  assert_status "POST /api/tasks/:id/approve (→ completed)" "200" "$STATUS" "$BODY"
fi

# ============================================================
section "9. REVIEW"
# ============================================================

if [ -n "$TASK_ID" ]; then
  RESP=$(curl -sw "\n%{http_code}" -X POST "$BASE/api/tasks/$TASK_ID/review" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d "{\"rating\":5,\"comment\":\"Excellent work on this test task!\"}" 2>/dev/null)
  BODY=$(echo "$RESP" | head -n -1)
  STATUS=$(echo "$RESP" | tail -1)
  assert_status "POST /api/tasks/:id/review" "201" "$STATUS" "$BODY"
fi

# Duplicate review
if [ -n "$TASK_ID" ]; then
  RESP=$(curl -sw "\n%{http_code}" -X POST "$BASE/api/tasks/$TASK_ID/review" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d "{\"rating\":4,\"comment\":\"Trying to review again\"}" 2>/dev/null)
  BODY=$(echo "$RESP" | head -n -1)
  STATUS=$(echo "$RESP" | tail -1)
  assert_status "POST /api/tasks/:id/review (duplicate → 409)" "409" "$STATUS" "$BODY"
fi

# ============================================================
section "10. DISPUTE FLOW"
# ============================================================

# Create a new task for dispute testing
RESP=$(curl -sw "\n%{http_code}" -X POST "$BASE/api/tasks" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"title\":\"Task for Dispute Test\",\"description\":\"This task will be used to test the dispute flow.\",\"budgetUsdc\":15}" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
DISPUTE_TASK_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('task',{}).get('id',''))" 2>/dev/null || echo "")

# Try dispute on open task (should fail — only in_progress/review)
if [ -n "$DISPUTE_TASK_ID" ]; then
  RESP=$(curl -sw "\n%{http_code}" -X POST "$BASE/api/tasks/$DISPUTE_TASK_ID/dispute" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d "{\"reason\":\"quality_issue\",\"description\":\"Testing dispute on open task\"}" 2>/dev/null)
  BODY=$(echo "$RESP" | head -n -1)
  STATUS=$(echo "$RESP" | tail -1)
  assert_status "POST /api/tasks/:id/dispute (open task → 400)" "400" "$STATUS" "$BODY"
fi

# ============================================================
section "11. NOTIFICATIONS"
# ============================================================

RESP=$(curl -sw "\n%{http_code}" "$BASE/api/agents/me/notifications" -H "$AUTH" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "GET /api/agents/me/notifications" "200" "$STATUS" "$BODY"

# Mark all read
RESP=$(curl -sw "\n%{http_code}" -X PUT "$BASE/api/agents/me/notifications" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"markAllRead\":true}" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "PUT /api/agents/me/notifications (mark all read)" "200" "$STATUS" "$BODY"

# ============================================================
section "12. AUTO-BID RULES"
# ============================================================

# Create auto-bid rule
RESP=$(curl -sw "\n%{http_code}" -X POST "$BASE/api/agents/me/auto-bid" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"name\":\"Test Rule\",\"categories\":[\"coding\"],\"skills\":[\"testing\"],\"maxBudgetUsdc\":100,\"bidStrategy\":\"undercut_10\"}" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "POST /api/agents/me/auto-bid" "201" "$STATUS" "$BODY"
RULE_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('rule',{}).get('id',''))" 2>/dev/null || echo "")

# Get auto-bid rules
RESP=$(curl -sw "\n%{http_code}" "$BASE/api/agents/me/auto-bid" -H "$AUTH" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "GET /api/agents/me/auto-bid" "200" "$STATUS" "$BODY"

# Update auto-bid rule
if [ -n "$RULE_ID" ]; then
  RESP=$(curl -sw "\n%{http_code}" -X PUT "$BASE/api/agents/me/auto-bid" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d "{\"ruleId\":\"$RULE_ID\",\"enabled\":false}" 2>/dev/null)
  BODY=$(echo "$RESP" | head -n -1)
  STATUS=$(echo "$RESP" | tail -1)
  assert_status "PUT /api/agents/me/auto-bid (disable)" "200" "$STATUS" "$BODY"
fi

# Delete auto-bid rule
if [ -n "$RULE_ID" ]; then
  RESP=$(curl -sw "\n%{http_code}" -X DELETE "$BASE/api/agents/me/auto-bid" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d "{\"ruleId\":\"$RULE_ID\"}" 2>/dev/null)
  BODY=$(echo "$RESP" | head -n -1)
  STATUS=$(echo "$RESP" | tail -1)
  assert_status "DELETE /api/agents/me/auto-bid" "200" "$STATUS" "$BODY"
fi

# ============================================================
section "13. DASHBOARD"
# ============================================================

RESP=$(curl -sw "\n%{http_code}" "$BASE/api/agents/me/dashboard" -H "$AUTH" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "GET /api/agents/me/dashboard" "200" "$STATUS" "$BODY"

# ============================================================
section "14. TRUST SCORE"
# ============================================================

RESP=$(curl -sw "\n%{http_code}" "$BASE/api/users/trust-score" -H "$AUTH" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "GET /api/users/trust-score" "200" "$STATUS" "$BODY"

# ============================================================
section "15. CANCEL FLOW"
# ============================================================

# Create and cancel a task
RESP=$(curl -sw "\n%{http_code}" -X POST "$BASE/api/tasks" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"title\":\"Task to Cancel\",\"description\":\"This task will be cancelled immediately.\",\"budgetUsdc\":5}" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
CANCEL_TASK_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('task',{}).get('id',''))" 2>/dev/null || echo "")

if [ -n "$CANCEL_TASK_ID" ]; then
  RESP=$(curl -sw "\n%{http_code}" -X POST "$BASE/api/tasks/$CANCEL_TASK_ID/cancel" \
    -H "$AUTH" -H "Content-Type: application/json" 2>/dev/null)
  BODY=$(echo "$RESP" | head -n -1)
  STATUS=$(echo "$RESP" | tail -1)
  assert_status "POST /api/tasks/:id/cancel" "200" "$STATUS" "$BODY"
fi

# ============================================================
section "16. WORKFLOW"
# ============================================================

# Create workflow
RESP=$(curl -sw "\n%{http_code}" -X POST "$BASE/api/workflows" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"name\":\"Test Workflow\",\"description\":\"A 2-step test workflow\",\"steps\":[{\"title\":\"Research\",\"budgetUsdc\":5,\"requiredSkills\":[\"research\"]},{\"title\":\"Write Report\",\"budgetUsdc\":5,\"requiredSkills\":[\"writing\"]}]}" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "POST /api/workflows (create)" "201" "$STATUS" "$BODY"
WORKFLOW_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('workflow',{}).get('id',''))" 2>/dev/null || echo "")

# Get workflow
if [ -n "$WORKFLOW_ID" ]; then
  RESP=$(curl -sw "\n%{http_code}" "$BASE/api/workflows/$WORKFLOW_ID" -H "$AUTH" 2>/dev/null)
  BODY=$(echo "$RESP" | head -n -1)
  STATUS=$(echo "$RESP" | tail -1)
  assert_status "GET /api/workflows/:id" "200" "$STATUS" "$BODY"
fi

# List workflows
RESP=$(curl -sw "\n%{http_code}" "$BASE/api/workflows" -H "$AUTH" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "GET /api/workflows (list)" "200" "$STATUS" "$BODY"

# Templates
RESP=$(curl -sw "\n%{http_code}" "$BASE/api/workflows/templates" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "GET /api/workflows/templates" "200" "$STATUS" "$BODY"

# ============================================================
section "17. EDGE CASES"
# ============================================================

# Non-existent task
RESP=$(curl -sw "\n%{http_code}" "$BASE/api/tasks/00000000-0000-0000-0000-000000000000" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "GET /api/tasks/:id (nonexistent → 404)" "404" "$STATUS" "$BODY"

# Task search with filters
RESP=$(curl -sw "\n%{http_code}" "$BASE/api/tasks?status=open&category=coding&sortBy=budget_high&limit=5" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "GET /api/tasks (with filters)" "200" "$STATUS" "$BODY"

# Agent search
RESP=$(curl -sw "\n%{http_code}" "$BASE/api/agents?search=research&minReputation=50" 2>/dev/null)
BODY=$(echo "$RESP" | head -n -1)
STATUS=$(echo "$RESP" | tail -1)
assert_status "GET /api/agents (search+filter)" "200" "$STATUS" "$BODY"

# ============================================================
# RESULTS
# ============================================================
echo ""
echo -e "${BLUE}━━━ RESULTS ━━━${NC}"
echo -e "  Total: $TOTAL"
echo -e "  ${GREEN}Passed: $PASS${NC}"
echo -e "  ${RED}Failed: $FAIL${NC}"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}❌ $FAIL test(s) failed${NC}"
  exit 1
else
  echo -e "${GREEN}✅ All $PASS tests passed!${NC}"
  exit 0
fi
