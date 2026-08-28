# Releasing

Notes mostly for myself!

To release a new version:

- run `npm run check` — typecheck, lint, format, unit tests
- update `CHANGELOG.md`
- bump the version in `package.json`
- commit and push

Then:

```sh
git tag -a v0.6.2 -m "Releasing version v0.6.2"
git push --tags
```

There's no CI and no build artifacts — users build from source (see `README.md`).
