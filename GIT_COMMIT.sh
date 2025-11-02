#!/bin/bash

# 提交所有改动
git add .

# 提交信息
COMMIT_MSG=$(cat COMMIT_MESSAGE.md | head -1)

# 执行提交
git commit -m "$COMMIT_MSG" -F COMMIT_MESSAGE.md

echo ""
echo "✅ 提交完成！"
echo ""
echo "提交信息："
echo "$COMMIT_MSG"
echo ""
echo "查看提交："
echo "  git log --oneline -1"
echo ""
echo "如需推送到远程："
echo "  git push"

