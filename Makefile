.PHONY: install up check test build backup up-prod service-install

install:
	corepack pnpm install --frozen-lockfile

up: install
	corepack pnpm dev

check:
	corepack pnpm check

test:
	corepack pnpm test

build:
	corepack pnpm build

backup:
	corepack pnpm --filter @aiwork/api exec tsx src/backup.ts

up-prod: install check test backup build
	powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-service.ps1

service-install: install check test backup build
	powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/install-service.ps1
