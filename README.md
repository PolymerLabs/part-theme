# part-theme


This is an experimental proof of concept shim for ::part or ::theme as defined
here https://tabatkins.github.io/specs/css-shadow-parts/.

`PartThemeMixin` should be applied to any elements that define or consume css. Elements may instead just call `applyPartTheme(element)` to avoid use of the mixin.

### Known Issues
* Works only for custom-elements that implement the `PartThemeMixin`.
* ::part/::theme selectors in main document styles are not applied.
* styling for dom that modifies `part` attributes after connectedCallback
requires use of the custom api `_applyPartTheme()`.

### Performance

Performance will likely be sub-optimal due to instance level work done to
support parts.

1. Element's styles are parsed for `::part`/`::theme` selectors. These are
re-written using css custom properties.

2. Element's `shadowRoot` dom is scanned for elements with part attributes.
A new style element is added with rules that match these attributes
corresponding to part properties provided as css custom properties from the
element ancestor.

NOTE: Any time dom is modified in the element containing part attributes,
`_applyPartTheme` must be called. This is done automatically only when the
element is connected.

### Future optimization
1. Support for ::theme requires traversing the entire ancestor tree. Dropping support for ::theme would remove this requirement and then ancestor traversal would only be required for forwarding (foo => forwarded-foo).
2. Currently css is unique for every element instance but unique css
is only required when part css is different. This should only be when
(a) host type changes, (b) element part attribute is different, (c) ::theme
changes in ancestor tree.
