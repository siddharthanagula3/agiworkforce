




if [ "$HOOK_EVENT_TYPE" != "SessionEnd" ]; then
  exit 0
fi

echo "Running pre-commit validation..."


cd "$(dirname "$0")/../.." || exit 1


echo "Running type check..."
if pnpm typecheck 2>&1 | tee /tmp/typecheck.log; then
  echo "✓ Type check passed"
else
  echo "✗ Type check failed"
  echo "See /tmp/typecheck.log for details"
  exit 1
fi


echo "Running linter..."
if pnpm lint 2>&1 | tee /tmp/lint.log; then
  echo "✓ Lint check passed"
else
  echo "✗ Lint check failed"
  echo "See /tmp/lint.log for details"
  exit 1
fi

echo "✓ All pre-commit checks passed"
exit 0
