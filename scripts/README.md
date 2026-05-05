# 1. 本地一键发版（更新 package.json、校验 CHANGELOG、运行测试、打 tag）
./scripts/release.sh 0.2.0

# 2. 推送触发 CI Release
git push origin main && git push origin v0.2.0