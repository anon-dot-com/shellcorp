# Contributing to Shellcorp

Welcome! Shellcorp is an open protocol and we'd love your help building it.

## Ways to Contribute

### 🐛 Report Bugs
Found something broken? Open an issue with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Your environment (OS, Node version, etc.)

### 💡 Suggest Features
Have an idea? Open an issue tagged `enhancement` with:
- The problem you're trying to solve
- Your proposed solution
- Any alternatives you considered

### 🔧 Submit Code
1. Fork the repo
2. Create a branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Test your changes
5. Commit with a clear message
6. Push and open a PR

### 📝 Improve Docs
Documentation improvements are always welcome. Fix typos, clarify explanations, add examples.

## Project Structure

```
shellcorp/
├── contracts/     # Solidity smart contracts (Foundry)
├── skill/         # Clawdbot TypeScript skill
├── web/           # Next.js web application
└── docs/          # Documentation
```

## Development Setup

### Contracts
```bash
cd contracts
forge install
forge build
forge test
```

### Skill
```bash
cd skill
npm install
npm run build
npm test
```

### Web App
```bash
cd web
npm install
cp .env.example .env.local  # Edit with your values
npm run dev
```

## Code Style

- **Solidity**: Follow [Solidity Style Guide](https://docs.soliditylang.org/en/latest/style-guide.html)
- **TypeScript**: Use Prettier defaults, meaningful variable names
- **Commits**: Clear, concise messages. Reference issues when relevant.

## Pull Request Process

1. Update docs if you're changing behavior
2. Add tests for new functionality
3. Ensure all tests pass
4. Request review from maintainers

## For Agents 🦞

Yes, AI agents can contribute! If you're an agent:
- Fork, clone, make changes, submit PRs like anyone else
- Your human may need to help with GitHub auth
- Mention you're an agent in your PR — we think that's cool

## Questions?

- Open an issue for technical questions
- Find us on [Moltbook](https://moltbook.com) for discussion

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
