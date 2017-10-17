/*
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

const partDataKey = '__cssParts';
const partIdKey = '__partId';

/**
 * Converts any style elements in the shadowRoot to replace ::part/::theme
 * with custom properties used to transmit this data down the dom tree. Also
 * caches part metadata for later lookup.
 * @param {Element} element
 */

function initializeParts(element) {
  if (!element.shadowRoot) {
    element[partDataKey] = null;
    return;
  }
  Array.from(element.shadowRoot.querySelectorAll('style')).forEach(style => {
    const info = partCssToCustomPropCss(element, style.textContent);
    if (info.parts) {
      element[partDataKey] = element[partDataKey] || [];
      element[partDataKey].push(...info.parts);
      style.textContent = info.css;
    }
  })
}

function ensurePartData(element) {
  if (!element.hasOwnProperty('__cssParts')) {
    initializeParts(element);
  }
}

function partDataForElement(element) {
  ensurePartData(element);
  return element[partDataKey];
}

// TODO(sorvell): brittle due to regex-ing css. Instead use a css parser.
/**
 * Turns css using `::part` into css using variables for those parts.
 * Also returns part metadata.
 * @param {Element} element
 * @param {string} cssText
 * @returns {Object} css: partified css, parts: array of parts of the form
 * {name, selector, props}
 * Example of part-ified css, given:
 * .foo::part(bar) { color: red }
 * output:
 * .foo { --e1-part-bar-color: red; }
 * where `e1` is a guid for this element.
 */
function partCssToCustomPropCss(element, cssText) {
  let parts;
  let css = cssText.replace(cssRe, (m, selector, type, name, endSelector, propsStr) => {
    parts = parts || [];
    let props = {};
    const propsArray = propsStr.split(/\s*;\s*/);
    propsArray.forEach(prop => {
      const s = prop.split(':');
      if (s.length == 2) {
        props[s[0].trim()] = s[1].trim();
      }
    });
    const id = partIdForElement(element);
    parts.push({selector, endSelector, name, props, isTheme: type == theme});
    let partProps = '';
    for (let p in props) {
      partProps = `${partProps}\n\t${varForPart(id, name, p, endSelector)}: ${props[p]};`;
    }
    return `\n${selector || '*'} {\n\t${partProps.trim()}\n}`;
  });
  return {parts, css};
}

// guid for element part scopes
let partId = 0;
function partIdForElement(element) {
  if (element[partIdKey] == undefined) {
    element[partIdKey] = partId++;
  }
  return element[partIdKey];
}

const theme = '::theme';
const cssRe = /\s*(.*)(::(?:part|theme))\(([^)]+)\)([^\s{]*)\s*{\s*([^}]*)\s*}/g

// creates a custom property name for a part.
function varForPart(id, name, prop, endSelector) {
  return `--e${id}-part-${name}-${prop}${endSelector ? `-${endSelector.replace(/\:/g, '')}` : ''}`;
}

/**
 * Produces a style using css custom properties to style ::part/::theme
 * for all the dom in the element's shadowRoot.
 * @param {Element} element
 */
export function applyPartTheme(element) {
  if (element.shadowRoot) {
    const oldStyle = element.shadowRoot.querySelector('style[parts]');
    if (oldStyle) {
      oldStyle.parentNode.removeChild(oldStyle);
    }
  }
  const host = element.getRootNode().host;
  if (host) {
    // note: ensure host has part data so that elements that boot up
    // while the host is being connected can style parts.
    ensurePartData(host);
    const css = cssForElementDom(element);
    if (css) {
      const newStyle = document.createElement('style');
      newStyle.textContent = css;
      element.shadowRoot.appendChild(newStyle);
    }
  }
}

/**
 * Produces cssText a style element to apply part css to a given element.
 * The element's shadowRoot dom is scanned for nodes with a `part` attribute.
 * Then selectors are created matching the part attribute containing properties
 * with parts defined in the element's host.
 * The ancestor tree is traversed for forwarded parts and theme.
 * e.g.
 * [part="bar"] {
 *   color: var(--e1-part-bar-color);
 * }
 * @param {Element} element Element for which to apply part css
 */
function cssForElementDom(element) {
  ensurePartData(element);
  const id = partIdForElement(element);
  const partNodes = element.shadowRoot.querySelectorAll('[part]');
  let css = '';
  for (let i=0; i < partNodes.length; i++) {
    const attr = partNodes[i].getAttribute('part');
    const partInfo = partInfoFromAttr(attr);
    css = `${css}\n\t${ruleForPartInfo(partInfo, attr, element)}`
  }
  return css;
}

/**
 * Creates a css rule that applies a part.
 * @param {*} partInfo Array of part info from part attribute
 * @param {*} attr Part attribute
 * @param {*} element Element within which the part exists
 * @returns {string} Text of the css rule of the form `selector { properties }`
 */
function ruleForPartInfo(partInfo, attr, element) {
  let text = '';
  partInfo.forEach(info => {
    if (!info.forward) {
      const props = propsForPart(info.name, element);
      if (props) {
        for (let bucket in props) {
          let propsBucket = props[bucket];
          let partProps = [];
          for (let p in propsBucket) {
            partProps.push(`${p}: ${propsBucket[p]};`);
          }
          text = `${text}\n[part="${attr}"]${bucket} {\n\t${partProps.join('\n\t')}\n}`;
        }
      }
    }
  });
  return text;
}

/**
 * Parses a part attribute into an array of part info
 * @param {*} attr Part attribute value
 * @returns {array} Array of part info objects of the form {name, foward}
 */
function partInfoFromAttr(attr) {
  const pieces = attr ? attr.split(/\s*,\s*/) : [];
  let parts = [];
  pieces.forEach(p => {
    const m = p ? p.match(/([^=\s]*)(?:\s*=>\s*(.*))?/) : [];
    if (m) {
      parts.push({name: m[2] || m[1], forward: m[2] ? m[1] : null});
    }
  });
  return parts;
}

/**
 * For a given part name returns a properties object which sets any ancestor
 * provided part properties to the proper ancestor provided variable name.
 * e.g.
 * color: `var(--e1-part-bar-color);`
 * @param {string} name Name of part
 * @param {Element} element Element within which dom with part exists
 * @param {string} originalName Original theme-able name
 * @returns {object} Object of properties for the given part set to part variables
 * provided by the elements ancestors.
 */
// TODO(sorvell): factoring here is awkward, particularly with requireTheme.
function propsForPart(name, element, originalName, requireTheme) {
  if (!element) {
    return;
  }
  let props;
  // bail if no host with PartMixin
  const host = element.getRootNode().host;
  const parts = host && partDataForElement(host);
  if (parts) {
    const id = partIdForElement(host);
    if (parts) {
      for (let i=0; i < parts.length; i++) {
        const part = parts[i];
        const matchName = part.isTheme ? originalName || name : name;
        if (part.name == matchName && (!requireTheme || part.isTheme)) {
          props = props || {};
          const bucket = part.endSelector || '';
          let b = props[bucket] = props[bucket] || {};
          for (let p in part.props) {
            b[p] = `var(${varForPart(id, matchName, p, part.endSelector)})`;
          }
        }
      }
    }
  }
  if (!requireTheme) {
    // forwarding: recurses up ancestor tree!
    const partInfo = partInfoFromAttr(element.getAttribute('part'));
    // {name, forward} where `*` can be included
    partInfo.forEach(info => {
      let catchAll = info.forward && (info.forward.indexOf('*') >= 0);
      if (name == info.forward || catchAll) {
        const ancestorName = catchAll ? info.name.replace('*', name) : info.name;
        const forwarded = propsForPart(ancestorName, host, originalName || name);
        props = mixPartProps(props, forwarded);
      }
    });
  }
  // theme!
  const themeProps = propsForPart(name, host, name, true);
  if (themeProps) {
    props = mixPartProps(props, themeProps);
  }
  return props;
}

function mixPartProps(a, b) {
  if (a) {
    for (let i in b) {
      Object.assign(a[i], b[i]);
    }
  }
  return a || b;
}

/**
 * CustomElement mixin that can be applied to provide ::part/::theme support.
 * @param {*} superClass
 */
export let PartThemeMixin = superClass => {

  return class PartThemeClass extends superClass {

    connectedCallback() {
      if (super.connectedCallback) {
        super.connectedCallback();
      }
      requestAnimationFrame(() => this._applyPartTheme());
    }

    _applyPartTheme() {
      applyPartTheme(this);
    }

  }

};