#!/bin/bash
PROD_URL="https://ledgerlab.ai"
GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
FAILURES=0

echo "🧪 API Health Check - Ledgerlab Production"
echo "=========================================="

for path in "/signup" "/login" "/"; do
  echo -n "→ Testing ${PROD_URL}${path}... "
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${PROD_URL}${path}")
  if [ "$STATUS" = "200" ]; then echo -e "${GREEN}✓${NC} HTTP $STATUS"
  else echo -e "${RED}✗${NC} HTTP $STATUS"; FAILURES=$((FAILURES+1)); fi
done

echo ""
if [ $FAILURES -eq 0 ]; then echo -e "${GREEN}✅ ALL CHECKS PASSED${NC}"; exit 0
else echo -e "${RED}❌ $FAILURES FAILED${NC}"; exit 1; fi
