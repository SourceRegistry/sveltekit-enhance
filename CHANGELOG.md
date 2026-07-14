## [1.7.1](https://github.com/SourceRegistry/sveltekit-enhance/compare/v1.7.0...v1.7.1) (2026-07-14)


### Bug Fixes

* force 503 status on startup HTML fallthrough ([d80498d](https://github.com/SourceRegistry/sveltekit-enhance/commit/d80498df2976961d6be57f2ed791dd27370baa05))

# [1.7.0](https://github.com/SourceRegistry/sveltekit-enhance/compare/v1.6.0...v1.7.0) (2026-07-14)


### Bug Fixes

* don't ready-redirect showPage in dev ([161b56b](https://github.com/SourceRegistry/sveltekit-enhance/commit/161b56bae665251d7fab23d0038889c30196135d))


### Features

* add StartUp helper, export from index, doc it ([da1eda3](https://github.com/SourceRegistry/sveltekit-enhance/commit/da1eda358dc0346eb105faa62da618f3b423b5ca))
* redirect showPage to readyRedirect once app is ready ([85fcc26](https://github.com/SourceRegistry/sveltekit-enhance/commit/85fcc2699e6d31f44eefa0640859c34456a52ad7))

# [1.6.0](https://github.com/SourceRegistry/sveltekit-enhance/compare/v1.5.1...v1.6.0) (2026-07-14)


### Features

* added nullable numbers and boolean to FormContext ([0ab3011](https://github.com/SourceRegistry/sveltekit-enhance/commit/0ab30115807f39ca3822f4151f970d00c6ac3b00))

## [1.5.1](https://github.com/SourceRegistry/sveltekit-enhance/compare/v1.5.0...v1.5.1) (2026-07-12)


### Bug Fixes

* request-rate-limit.ts api ([c8b05e7](https://github.com/SourceRegistry/sveltekit-enhance/commit/c8b05e743cfbfa6b3e8ad79b003abcae68b86b57))

# [1.5.0](https://github.com/SourceRegistry/sveltekit-enhance/compare/v1.4.2...v1.5.0) (2026-07-12)


### Bug Fixes

* resolve svelte-check errors in request-rate-limit.ts ([a0bfbaa](https://github.com/SourceRegistry/sveltekit-enhance/commit/a0bfbaacfc6e4877217824e9cc3b4391c99b256d))


### Features

* add request rate-limit with pluggable store ([a7fc187](https://github.com/SourceRegistry/sveltekit-enhance/commit/a7fc1879aaadcadde5af7315431514ce11ff8e4f))

## [1.4.2](https://github.com/SourceRegistry/sveltekit-enhance/compare/v1.4.1...v1.4.2) (2026-07-10)


### Bug Fixes

* added url to request-monitor ([002a9c0](https://github.com/SourceRegistry/sveltekit-enhance/commit/002a9c0cd75cd2dfe39062984bcc6016c5881815))

## [1.4.1](https://github.com/SourceRegistry/sveltekit-enhance/compare/v1.4.0...v1.4.1) (2026-07-10)


### Bug Fixes

* added url to request-monitor ([28b64fe](https://github.com/SourceRegistry/sveltekit-enhance/commit/28b64fef64cfa67c62101d2c2052a0fb70f75301))

# [1.4.0](https://github.com/SourceRegistry/sveltekit-enhance/compare/v1.3.3...v1.4.0) (2026-05-29)


### Features

* added cache helpers. ([d8dd899](https://github.com/SourceRegistry/sveltekit-enhance/commit/d8dd899b2ed83f5f2156f7ef36ba39e56ada95e1))

## [1.3.3](https://github.com/SourceRegistry/sveltekit-enhance/compare/v1.3.2...v1.3.3) (2026-05-18)


### Bug Fixes

* request-monitor trace_id to play nice with RequestCorrelation helper ([9157909](https://github.com/SourceRegistry/sveltekit-enhance/commit/9157909319b74e87c7523c585013eaa2492c2daf))

## [1.3.2](https://github.com/SourceRegistry/sveltekit-enhance/compare/v1.3.1...v1.3.2) (2026-05-17)


### Bug Fixes

* SSE behavior to the enhance.handle ([660595d](https://github.com/SourceRegistry/sveltekit-enhance/commit/660595d86c22e7083831c63ec96b1cd50932f47c))

## [1.3.1](https://github.com/SourceRegistry/sveltekit-enhance/compare/v1.3.0...v1.3.1) (2026-05-17)


### Bug Fixes

* added _date in Form.enhance so a date can also be null ([085c91e](https://github.com/SourceRegistry/sveltekit-enhance/commit/085c91ec7b2229ba6dbbdd554fec6e7ba3547887))

# [1.3.0](https://github.com/SourceRegistry/sveltekit-enhance/compare/v1.2.0...v1.3.0) (2026-05-17)


### Features

* added CSRF helper and exposed logger typing ([d8f7add](https://github.com/SourceRegistry/sveltekit-enhance/commit/d8f7addce582ff5b4c3c8a43a6fb635a3129cad4))
* added CSRF helper and exposed logger typing ([8d30b65](https://github.com/SourceRegistry/sveltekit-enhance/commit/8d30b65cf8ff43aca64ee8ce31812807c51158d9))

# [1.2.0](https://github.com/SourceRegistry/sveltekit-enhance/compare/v1.1.2...v1.2.0) (2026-05-17)


### Features

* added request-monitor helper and getClientAddress optional when adapters put it in the RequestEvent Object. ([acb81d4](https://github.com/SourceRegistry/sveltekit-enhance/commit/acb81d436a9391fd44533155d886cca82328b5e0))

## [1.1.2](https://github.com/SourceRegistry/sveltekit-enhance/compare/v1.1.1...v1.1.2) (2026-05-07)


### Bug Fixes

* enhance handle function work more like sveltekit sequence ([298adeb](https://github.com/SourceRegistry/sveltekit-enhance/commit/298adeb9bc631f5016d1c63d3634545064e41440))
* enhance handle function work more like sveltekit sequence ([40a4194](https://github.com/SourceRegistry/sveltekit-enhance/commit/40a4194a24165de9fb6177c197a45081dcc49c4f))

## [1.1.1](https://github.com/SourceRegistry/sveltekit-enhance/compare/v1.1.0...v1.1.1) (2026-05-06)


### Bug Fixes

* form helper ([33b0470](https://github.com/SourceRegistry/sveltekit-enhance/commit/33b047075ad2f18ce09345c9d0ce990ef2db9e79))

# [1.1.0](https://github.com/SourceRegistry/sveltekit-enhance/compare/v1.0.1...v1.1.0) (2026-05-06)


### Features

* relaxed route_id typings and added typing on error handlers for response ([1370ac3](https://github.com/SourceRegistry/sveltekit-enhance/commit/1370ac354ce03ce99ff15c1081876ac221192f64))

## [1.0.1](https://github.com/SourceRegistry/sveltekit-enhance/compare/v1.0.0...v1.0.1) (2026-04-28)


### Bug Fixes

* duplicate enhance export ([09743a5](https://github.com/SourceRegistry/sveltekit-enhance/commit/09743a575df2713810af607e27eed1c64b8b30eb))

# 1.0.0 (2026-04-28)


### Bug Fixes

* export and rollup issues ([f686d1f](https://github.com/SourceRegistry/sveltekit-enhance/commit/f686d1f3a8382f7b45a9acacb8d023ca26e740ef))
* export and rollup issues ([287a8d6](https://github.com/SourceRegistry/sveltekit-enhance/commit/287a8d613917bad44ba7e9b61a785d0a8f7be701))
* first release ([56c3bee](https://github.com/SourceRegistry/sveltekit-enhance/commit/56c3bee1a436a969b8fa82caaa1a4db274822e7b))
