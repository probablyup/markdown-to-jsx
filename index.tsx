/* @jsx h */
/**
 * markdown-to-jsx@6 is a fork of [simple-markdown v0.2.2](https://github.com/Khan/simple-markdown)
 * from Khan Academy. Thank you Khan devs for making such an awesome and extensible
 * parsing infra... without it, half of the optimizations here wouldn't be feasible. 🙏🏼
 */
import React from 'react'
/// <reference path="unquote.d.ts" />
import unquote from 'unquote'

export namespace MarkdownToJSX {
  /**
   * RequireAtLeastOne<{ ... }> <- only requires at least one key
   */
  type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<
    T,
    Exclude<keyof T, Keys>
  > &
    {
      [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>
    }[Keys]

  export type CreateElement = typeof React.createElement

  export type HTMLTags = keyof JSX.IntrinsicElements

  export type State = {
    _list?: boolean
    inline?: boolean
    inTable?: boolean
    key?: React.Key
    simple?: boolean
  }

  export type ParserResult = {
    [key: string]: any
    type?: string
  }

  export type NestedParser = (
    input: string,
    state?: MarkdownToJSX.State
  ) => MarkdownToJSX.ParserResult

  export type Parser<ParserOutput> = (
    capture: RegExpMatchArray,
    nestedParse: NestedParser,
    state?: MarkdownToJSX.State
  ) => ParserOutput

  export type RuleOutput = (
    ast: MarkdownToJSX.ParserResult,
    state: MarkdownToJSX.State
  ) => JSX.Element

  export type Rule<ParserOutput = MarkdownToJSX.ParserResult> = {
    match: (
      source: string,
      state: MarkdownToJSX.State,
      prevCapturedString?: string
    ) => RegExpMatchArray
    order: Priority
    parse: MarkdownToJSX.Parser<ParserOutput>
    react?: (
      node: ParserOutput,
      output: RuleOutput,
      state?: MarkdownToJSX.State
    ) => React.ReactChild
  }

  export type Rules = {
    [key: string]: Rule
  }

  export type Override =
    | RequireAtLeastOne<{
        component: React.ElementType
        props: Object
      }>
    | React.ElementType

  export type Overrides = {
    [tag in HTMLTags]?: Override
  } & {
    [customComponent: string]: Override
  }

  export type Options = Partial<{
    /**
     * Ultimate control over the output of all rendered JSX.
     */
    createElement: (
      tag: Parameters<CreateElement>[0],
      props: React.Props<any>,
      ...children: React.ReactChild[]
    ) => JSX.Element

    /**
     * Disable the compiler's best-effort transcription of provided raw HTML
     * into JSX-equivalent. This is the functionality that prevents the need to
     * use `dangerouslySetInnerHTML` in React.
     */
    disableParsingRawHTML: boolean

    /**
     * Forces the compiler to always output content with a block-level wrapper
     * (`<p>` or any block-level syntax your markdown already contains.)
     */
    forceBlock: boolean

    /**
     * Forces the compiler to always output content with an inline wrapper (`<span>`)
     */
    forceInline: boolean

    /**
     * Supply additional HTML entity: unicode replacement mappings.
     *
     * Pass only the inner part of the entity as the key,
     * e.g. `&le;` -> `{ "le": "\u2264" }`
     *
     * By default
     * the following entites are replaced with their unicode equivalents:
     *
     * ```
     * &amp;
     * &apos;
     * &gt;
     * &lt;
     * &nbsp;
     * &quot;
     * ```
     */
    namedCodesToUnicode: {
      [key: string]: string
    }

    /**
     * Selectively control the output of particular HTML tags as they would be
     * emitted by the compiler.
     */
    overrides: Overrides

    /**
     * Declare the type of the wrapper to be used when there are multiple
     * children to render. Set to `null` to get an array of children back
     * without any wrapper, or use `React.Fragment` to get a React element
     * that won't show up in the DOM.
     */
    wrapper: React.ElementType | null

    /**
     * Forces the compiler to wrap results, even if there is only a single
     * child or no children.
     */
    forceWrapper: boolean

    /**
     * Override normalization of non-URI-safe characters for use in generating
     * HTML IDs for anchor linking purposes.
     */
    slugify: (source: string) => string
  }>
}

/** TODO: Drop for React 16? */
const ATTRIBUTE_TO_JSX_PROP_MAP = {
  accesskey: 'accessKey',
  allowfullscreen: 'allowFullScreen',
  allowtransparency: 'allowTransparency',
  autocomplete: 'autoComplete',
  autofocus: 'autoFocus',
  autoplay: 'autoPlay',
  cellpadding: 'cellPadding',
  cellspacing: 'cellSpacing',
  charset: 'charSet',
  class: 'className',
  classid: 'classId',
  colspan: 'colSpan',
  contenteditable: 'contentEditable',
  contextmenu: 'contextMenu',
  crossorigin: 'crossOrigin',
  enctype: 'encType',
  for: 'htmlFor',
  formaction: 'formAction',
  formenctype: 'formEncType',
  formmethod: 'formMethod',
  formnovalidate: 'formNoValidate',
  formtarget: 'formTarget',
  frameborder: 'frameBorder',
  hreflang: 'hrefLang',
  inputmode: 'inputMode',
  keyparams: 'keyParams',
  keytype: 'keyType',
  marginheight: 'marginHeight',
  marginwidth: 'marginWidth',
  maxlength: 'maxLength',
  mediagroup: 'mediaGroup',
  minlength: 'minLength',
  novalidate: 'noValidate',
  radiogroup: 'radioGroup',
  readonly: 'readOnly',
  rowspan: 'rowSpan',
  spellcheck: 'spellCheck',
  srcdoc: 'srcDoc',
  srclang: 'srcLang',
  srcset: 'srcSet',
  tabindex: 'tabIndex',
  usemap: 'useMap',
} as const

const namedCodesToUnicode = {
  amp: '\u0026',
  apos: '\u0027',
  gt: '\u003e',
  lt: '\u003c',
  nbsp: '\u00a0',
  quot: '\u201c',
} as const

const DO_NOT_PROCESS_HTML_ELEMENTS = ['style', 'script']

/**
 * the attribute extractor regex looks for a valid attribute name,
 * followed by an equal sign (whitespace around the equal sign is allowed), followed
 * by one of the following:
 *
 * 1. a single quote-bounded string, e.g. 'foo'
 * 2. a double quote-bounded string, e.g. "bar"
 * 3. an interpolation, e.g. {something}
 *
 * JSX can be be interpolated into itself and is passed through the compiler using
 * the same options and setup as the current run.
 *
 * <Something children={<SomeOtherThing />} />
 *                      ==================
 *                              ↳ children: [<SomeOtherThing />]
 *
 * Otherwise, interpolations are handled as strings or simple booleans
 * unless HTML syntax is detected.
 *
 * <Something color={green} disabled={true} />
 *                   =====            ====
 *                     ↓                ↳ disabled: true
 *                     ↳ color: "green"
 *
 * Numbers are not parsed at this time due to complexities around int, float,
 * and the upcoming bigint functionality that would make handling it unwieldy.
 * Parse the string in your component as desired.
 *
 * <Something someBigNumber={123456789123456789} />
 *                           ==================
 *                                   ↳ someBigNumber: "123456789123456789"
 */
const ATTR_EXTRACTOR_R = /([-A-Z0-9_:]+)(?:\s*=\s*(?:(?:"((?:\\.|[^"])*)")|(?:'((?:\\.|[^'])*)')|(?:\{((?:\\.|{[^}]*?}|[^}])*)\})))?/gi

/** TODO: Write explainers for each of these */

const AUTOLINK_MAILTO_CHECK_R = /mailto:/i
const BLOCK_END_R = /\n{2,}$/
const BLOCKQUOTE_R = /^( *>[^\n]+(\n[^\n]+)*\n*)+\n{2,}/
const BLOCKQUOTE_TRIM_LEFT_MULTILINE_R = /^ *> ?/gm
const BREAK_LINE_R = /^ {2,}\n/
const BREAK_THEMATIC_R = /^(?:( *[-*_]) *){3,}(?:\n *)+\n/
const CODE_BLOCK_FENCED_R = /^\s*(`{3,}|~{3,}) *(\S+)? *\n([\s\S]+?)\s*\1 *(?:\n *)+\n?/
const CODE_BLOCK_R = /^(?: {4}[^\n]+\n*)+(?:\n *)+\n?/
const CODE_INLINE_R = /^(`+)\s*([\s\S]*?[^`])\s*\1(?!`)/
const CONSECUTIVE_NEWLINE_R = /^(?:\n *)*\n/
const CR_NEWLINE_R = /\r\n?/g
const FOOTNOTE_R = /^\[\^([^\]]+)](:.*)\n/
const FOOTNOTE_REFERENCE_R = /^\[\^([^\]]+)]/
const FORMFEED_R = /\f/g
const GFM_TASK_R = /^\s*?\[(x|\s)\]/
const HEADING_R = /^ *(#{1,6}) *([^\n]+?)(?: +#*)?(?:\n *)*(?:\n|$)/
const HEADING_SETEXT_R = /^([^\n]+)\n *(=|-){3,} *(?:\n *)+\n/

/**
 * Explanation:
 *
 * 1. Look for a starting tag, preceeded by any amount of spaces
 *    ^ *<
 *
 * 2. Capture the tag name (capture 1)
 *    ([^ >/]+)
 *
 * 3. Ignore a space after the starting tag and capture the attribute portion of the tag (capture 2)
 *     ?([^>]*)\/{0}>
 *
 * 4. Ensure a matching closing tag is present in the rest of the input string
 *    (?=[\s\S]*<\/\1>)
 *
 * 5. Capture everything until the matching closing tag -- this might include additional pairs
 *    of the same tag type found in step 2 (capture 3)
 *    ((?:[\s\S]*?(?:<\1[^>]*>[\s\S]*?<\/\1>)*[\s\S]*?)*?)<\/\1>
 *
 * 6. Capture excess newlines afterward
 *    \n*
 */
const HTML_BLOCK_ELEMENT_R = /^ *(?!<[a-z][^ >/]* ?\/>)<([a-z][^ >/]*) ?([^>]*)\/{0}>\n?(\s*(?:<\1[^>]*?>[\s\S]*?<\/\1>|(?!<\1)[\s\S])*?)<\/\1>\n*/i

const HTML_CHAR_CODE_R = /&([a-z]+|[#\d]+);/g

const HTML_COMMENT_R = /^<!--[\s\S]*?(?:-->)/

/**
 * borrowed from React 15(https://github.com/facebook/react/blob/894d20744cba99383ffd847dbd5b6e0800355a5c/src/renderers/dom/shared/HTMLDOMPropertyConfig.js)
 */
const HTML_CUSTOM_ATTR_R = /^(data|aria|x)-[a-z_][a-z\d_.-]*$/

const HTML_SELF_CLOSING_ELEMENT_R = /^ *<([a-z][a-z0-9:]*)(?:\s+((?:<.*?>|[^>])*))?\/?>(?!<\/\1>)(\s*\n)?/i
const INTERPOLATION_R = /^\{.*\}$/
const LINK_AUTOLINK_BARE_URL_R = /^(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/
const LINK_AUTOLINK_MAILTO_R = /^<([^ >]+@[^ >]+)>/
const LINK_AUTOLINK_R = /^<([^ >]+:\/[^ >]+)>/
const LIST_ITEM_END_R = / *\n+$/
const LIST_LOOKBEHIND_R = /(?:^|\n)( *)$/
const CAPTURE_LETTER_AFTER_HYPHEN = /-([a-z])?/gi
const NP_TABLE_R = /^(.*\|?.*)\n *(\|? *[-:]+ *\|[-| :]*)\n((?:.*\|.*\n)*)\n?/
const PARAGRAPH_R = /^((?:[^\n]|\n(?! *\n))+)(?:\n *)+\n/
const REFERENCE_IMAGE_OR_LINK = /^\[([^\]]*)\]:\s*(\S+)\s*("([^"]*)")?/
const REFERENCE_IMAGE_R = /^!\[([^\]]*)\] ?\[([^\]]*)\]/
const REFERENCE_LINK_R = /^\[([^\]]*)\] ?\[([^\]]*)\]/
const SQUARE_BRACKETS_R = /(\[|\])/g
const SHOULD_RENDER_AS_BLOCK_R = /(\n|^[-*]\s|^#|^ {2,}|^-{2,}|^>\s)/
const TAB_R = /\t/g
const TABLE_SEPARATOR_R = /^ *\| */
const TABLE_TRIM_PIPES = /(^ *\||\| *$)/g
const TABLE_CELL_END_TRIM = / *$/
const TABLE_CENTER_ALIGN = /^ *:-+: *$/
const TABLE_LEFT_ALIGN = /^ *:-+ *$/
const TABLE_RIGHT_ALIGN = /^ *-+: *$/

const TEXT_BOLD_R = /^([*_])\1((?:\[.*?\][([].*?[)\]]|<.*?>(?:.*?<.*?>)?|`.*?`|~+.*?~+|.)*?)\1\1(?!\1)/
const TEXT_EMPHASIZED_R = /^([*_])((?:\[.*?\][([].*?[)\]]|<.*?>(?:.*?<.*?>)?|`.*?`|~+.*?~+|.)*?)\1(?!\1)/
const TEXT_STRIKETHROUGHED_R = /^~~((?:\[.*?\]|<.*?>(?:.*?<.*?>)?|`.*?`|.)*?)~~/

const TEXT_ESCAPED_R = /^\\([^0-9A-Za-z\s])/
const TEXT_PLAIN_R = /^[\s\S]+?(?=[^0-9A-Z\s\u00c0-\uffff&#;.()'"]|\d+\.|\n\n| {2,}\n|\w+:\S|$)/i
const TRIM_NEWLINES_AND_TRAILING_WHITESPACE_R = /(^\n+|\n+$|\s+$)/g

const HTML_LEFT_TRIM_AMOUNT_R = /^([ \t]*)/

const UNESCAPE_URL_R = /\\([^0-9A-Z\s])/gi

// recognize a `*` `-`, `+`, `1.`, `2.`... list bullet
const LIST_BULLET = '(?:[*+-]|\\d+\\.)'

// recognize the start of a list item:
// leading space plus a bullet plus a space (`   * `)
const LIST_ITEM_PREFIX = '( *)(' + LIST_BULLET + ') +'
const LIST_ITEM_PREFIX_R = new RegExp('^' + LIST_ITEM_PREFIX)

// recognize an individual list item:
//  * hi
//    this is part of the same item
//
//    as is this, which is a new paragraph in the same item
//
//  * but this is not part of the same item
const LIST_ITEM_R = new RegExp(
  LIST_ITEM_PREFIX +
    '[^\\n]*(?:\\n' +
    '(?!\\1' +
    LIST_BULLET +
    ' )[^\\n]*)*(\\n|$)',
  'gm'
)

// check whether a list item has paragraphs: if it does,
// we leave the newlines at the end
const LIST_R = new RegExp(
  '^( *)(' +
    LIST_BULLET +
    ') ' +
    '[\\s\\S]+?(?:\\n{2,}(?! )' +
    '(?!\\1' +
    LIST_BULLET +
    ' (?!' +
    LIST_BULLET +
    ' ))\\n*' +
    // the \\s*$ here is so that we can parse the inside of nested
    // lists, where our content might end before we receive two `\n`s
    '|\\s*\\n*$)'
)

const LINK_INSIDE = '(?:\\[[^\\]]*\\]|[^\\[\\]]|\\](?=[^\\[]*\\]))*'
const LINK_HREF_AND_TITLE =
  '\\s*<?((?:[^\\s\\\\]|\\\\.)*?)>?(?:\\s+[\'"]([\\s\\S]*?)[\'"])?\\s*'

const LINK_R = new RegExp(
  '^\\[(' + LINK_INSIDE + ')\\]\\(' + LINK_HREF_AND_TITLE + '\\)'
)

const IMAGE_R = new RegExp(
  '^!\\[(' + LINK_INSIDE + ')\\]\\(' + LINK_HREF_AND_TITLE + '\\)'
)

const BLOCK_SYNTAXES = [
  BLOCKQUOTE_R,
  CODE_BLOCK_R,
  CODE_BLOCK_FENCED_R,
  HEADING_R,
  HEADING_SETEXT_R,
  HTML_BLOCK_ELEMENT_R,
  HTML_COMMENT_R,
  HTML_SELF_CLOSING_ELEMENT_R,
  LIST_ITEM_R,
  LIST_R,
  NP_TABLE_R,
  PARAGRAPH_R,
]

function containsBlockSyntax(input: string) {
  return BLOCK_SYNTAXES.some(r => r.test(input))
}

// based on https://stackoverflow.com/a/18123682/1141611
// not complete, but probably good enough
function slugify(str: string) {
  return str
    .replace(/[ÀÁÂÃÄÅàáâãäåæÆ]/g, 'a')
    .replace(/[çÇ]/g, 'c')
    .replace(/[ðÐ]/g, 'd')
    .replace(/[ÈÉÊËéèêë]/g, 'e')
    .replace(/[ÏïÎîÍíÌì]/g, 'i')
    .replace(/[Ññ]/g, 'n')
    .replace(/[øØœŒÕõÔôÓóÒò]/g, 'o')
    .replace(/[ÜüÛûÚúÙù]/g, 'u')
    .replace(/[ŸÿÝý]/g, 'y')
    .replace(/[^a-z0-9- ]/gi, '')
    .replace(/ /gi, '-')
    .toLowerCase()
}

function parseTableAlignCapture(alignCapture: string) {
  if (TABLE_RIGHT_ALIGN.test(alignCapture)) {
    return 'right'
  } else if (TABLE_CENTER_ALIGN.test(alignCapture)) {
    return 'center'
  } else if (TABLE_LEFT_ALIGN.test(alignCapture)) {
    return 'left'
  }

  return null
}

function parseTableRow(
  source: string,
  parse: MarkdownToJSX.NestedParser,
  state: MarkdownToJSX.State
) {
  const prevInTable = state.inTable
  state.inTable = true
  const tableRow = parse(source.trim(), state)
  state.inTable = prevInTable

  let cells = [[]]
  tableRow.forEach(function (node, i) {
    if (node.type === 'tableSeparator') {
      // Filter out empty table separators at the start/end:
      if (i !== 0 && i !== tableRow.length - 1) {
        // Split the current row:
        cells.push([])
      }
    } else {
      if (
        node.type === 'text' &&
        (tableRow[i + 1] == null || tableRow[i + 1].type === 'tableSeparator')
      ) {
        node.content = node.content.replace(TABLE_CELL_END_TRIM, '')
      }
      cells[cells.length - 1].push(node)
    }
  })
  return cells
}

function parseTableAlign(source: string /*, parse, state*/) {
  const alignText = source.replace(TABLE_TRIM_PIPES, '').split('|')

  return alignText.map(parseTableAlignCapture)
}

function parseTableCells(
  source: string,
  parse: MarkdownToJSX.NestedParser,
  state: Object
) {
  const rowsText = source.trim().split('\n')

  return rowsText.map(function (rowText) {
    return parseTableRow(rowText, parse, state)
  })
}

function parseTable(
  capture: RegExpMatchArray,
  parse: MarkdownToJSX.NestedParser,
  state: MarkdownToJSX.State
) {
  state.inline = true
  const header = parseTableRow(capture[1], parse, state)
  const align = parseTableAlign(capture[2])
  const cells = parseTableCells(capture[3], parse, state)
  state.inline = false

  return {
    align: align,
    cells: cells,
    header: header,
    type: 'table',
  }
}

function getTableStyle(node, colIndex) {
  return node.align[colIndex] == null
    ? {}
    : {
        textAlign: node.align[colIndex],
      }
}

/** TODO: remove for react 16 */
function normalizeAttributeKey(key) {
  const hyphenIndex = key.indexOf('-')

  if (hyphenIndex !== -1 && key.match(HTML_CUSTOM_ATTR_R) === null) {
    key = key.replace(CAPTURE_LETTER_AFTER_HYPHEN, function (_, letter) {
      return letter.toUpperCase()
    })
  }

  return key
}

function attributeValueToJSXPropValue(
  key: JSX.IntrinsicAttributes,
  value: string
): any {
  if (key === 'style') {
    return value.split(/;\s?/).reduce(function (styles, kvPair) {
      const key = kvPair.slice(0, kvPair.indexOf(':'))

      // snake-case to camelCase
      // also handles PascalCasing vendor prefixes
      const camelCasedKey = key.replace(/(-[a-z])/g, substr =>
        substr[1].toUpperCase()
      )

      // key.length + 1 to skip over the colon
      styles[camelCasedKey] = kvPair.slice(key.length + 1).trim()

      return styles
    }, {})
  } else if (key === 'href') {
    return sanitizeUrl(value)
  } else if (value.match(INTERPOLATION_R)) {
    // return as a string and let the consumer decide what to do with it
    value = value.slice(1, value.length - 1)
  }

  if (value === 'true') {
    return true
  } else if (value === 'false') {
    return false
  }

  return value
}

function normalizeWhitespace(source: string): string {
  return source
    .replace(CR_NEWLINE_R, '\n')
    .replace(FORMFEED_R, '')
    .replace(TAB_R, '    ')
}

/**
 * Creates a parser for a given set of rules, with the precedence
 * specified as a list of rules.
 *
 * @rules: an object containing
 * rule type -> {match, order, parse} objects
 * (lower order is higher precedence)
 * (Note: `order` is added to defaultRules after creation so that
 *  the `order` of defaultRules in the source matches the `order`
 *  of defaultRules in terms of `order` fields.)
 *
 * @returns The resulting parse function, with the following parameters:
 *   @source: the input source string to be parsed
 *   @state: an optional object to be threaded through parse
 *     calls. Allows clients to add stateful operations to
 *     parsing, such as keeping track of how many levels deep
 *     some nesting is. For an example use-case, see passage-ref
 *     parsing in src/widgets/passage/passage-markdown.jsx
 */
function parserFor(
  rules: MarkdownToJSX.Rules
): (
  source: string,
  state: MarkdownToJSX.State
) => ReturnType<MarkdownToJSX.NestedParser> {
  // Sorts rules in order of increasing order, then
  // ascending rule name in case of ties.
  let ruleList = Object.keys(rules)

  /* istanbul ignore next */
  if (process.env.NODE_ENV !== 'production') {
    ruleList.forEach(function (type) {
      let order = rules[type].order
      if (
        process.env.NODE_ENV !== 'production' &&
        (typeof order !== 'number' || !isFinite(order))
      ) {
        console.warn(
          'markdown-to-jsx: Invalid order for rule `' + type + '`: ' + order
        )
      }
    })
  }

  ruleList.sort(function (typeA, typeB) {
    let orderA = rules[typeA].order
    let orderB = rules[typeB].order

    // First sort based on increasing order
    if (orderA !== orderB) {
      return orderA - orderB

      // Then based on increasing unicode lexicographic ordering
    } else if (typeA < typeB) {
      return -1
    }

    return 1
  })

  function nestedParse(
    source: string,
    state: MarkdownToJSX.State
  ): MarkdownToJSX.ParserResult[] {
    let result = []

    // We store the previous capture so that match functions can
    // use some limited amount of lookbehind. Lists use this to
    // ensure they don't match arbitrary '- ' or '* ' in inline
    // text (see the list rule for more information).
    let prevCapture = ''
    while (source) {
      let i = 0
      while (i < ruleList.length) {
        const ruleType = ruleList[i]
        const rule = rules[ruleType]
        const capture = rule.match(source, state, prevCapture)

        if (capture) {
          const currCaptureString = capture[0]
          source = source.substring(currCaptureString.length)
          const parsed = rule.parse(capture, nestedParse, state)

          // We also let rules override the default type of
          // their parsed node if they would like to, so that
          // there can be a single output function for all links,
          // even if there are several rules to parse them.
          if (parsed.type == null) {
            parsed.type = ruleType
          }

          result.push(parsed)

          prevCapture = currCaptureString
          break
        }

        i++
      }
    }

    return result
  }

  return function outerParse(source, state) {
    return nestedParse(normalizeWhitespace(source), state)
  }
}

// Creates a match function for an inline scoped or simple element from a regex
function inlineRegex(regex: RegExp) {
  return function match(source, state) {
    if (state.inline) {
      return regex.exec(source)
    } else {
      return null
    }
  }
}

// basically any inline element except links
function simpleInlineRegex(regex: RegExp) {
  return function match(source: string, state: MarkdownToJSX.State) {
    if (state.inline || state.simple) {
      return regex.exec(source)
    } else {
      return null
    }
  }
}

// Creates a match function for a block scoped element from a regex
function blockRegex(regex: RegExp) {
  return function match(source: string, state: MarkdownToJSX.State) {
    if (state.inline || state.simple) {
      return null
    } else {
      return regex.exec(source)
    }
  }
}

// Creates a match function from a regex, ignoring block/inline scope
function anyScopeRegex(regex: RegExp) {
  return function match(source: string /*, state*/) {
    return regex.exec(source)
  }
}

function reactFor(outputFunc) {
  return function nestedReactOutput(
    ast: MarkdownToJSX.ParserResult | MarkdownToJSX.ParserResult[],
    state: MarkdownToJSX.State = {}
  ): React.ReactChild[] {
    if (Array.isArray(ast)) {
      const oldKey = state.key
      const result = []

      // map nestedOutput over the ast, except group any text
      // nodes together into a single string output.
      let lastWasString = false

      for (let i = 0; i < ast.length; i++) {
        state.key = i

        const nodeOut = nestedReactOutput(ast[i], state)
        const isString = typeof nodeOut === 'string'

        if (isString && lastWasString) {
          result[result.length - 1] += nodeOut
        } else {
          result.push(nodeOut)
        }

        lastWasString = isString
      }

      state.key = oldKey

      return result
    }

    return outputFunc(ast, nestedReactOutput, state)
  }
}

function sanitizeUrl(url: string): string | null {
  try {
    const decoded = decodeURIComponent(url).replace(/[^A-Za-z0-9/:]/g, '')

    if (decoded.match(/^\s*(javascript|vbscript|data):/i)) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          'Anchor URL contains an unsafe JavaScript/VBScript/data expression, it will not be rendered.',
          decoded
        )
      }

      return null
    }
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        'Anchor URL could not be decoded due to malformed syntax or characters, it will not be rendered.',
        url
      )
    }

    // decodeURIComponent sometimes throws a URIError
    // See `decodeURIComponent('a%AFc');`
    // http://stackoverflow.com/questions/9064536/javascript-decodeuricomponent-malformed-uri-exception
    return null
  }

  return url
}

function unescapeUrl(rawUrlString: string): string {
  return rawUrlString.replace(UNESCAPE_URL_R, '$1')
}

/**
 * Everything inline, including links.
 */
function parseInline(
  parse: MarkdownToJSX.NestedParser,
  content: string,
  state: MarkdownToJSX.State
): MarkdownToJSX.ParserResult {
  const isCurrentlyInline = state.inline || false
  const isCurrentlySimple = state.simple || false
  state.inline = true
  state.simple = true
  const result = parse(content, state)
  state.inline = isCurrentlyInline
  state.simple = isCurrentlySimple
  return result
}

/**
 * Anything inline that isn't a link.
 */
function parseSimpleInline(
  parse: MarkdownToJSX.NestedParser,
  content: string,
  state: MarkdownToJSX.State
): MarkdownToJSX.ParserResult {
  const isCurrentlyInline = state.inline || false
  const isCurrentlySimple = state.simple || false
  state.inline = false
  state.simple = true
  const result = parse(content, state)
  state.inline = isCurrentlyInline
  state.simple = isCurrentlySimple
  return result
}

function parseBlock(parse, content, state): MarkdownToJSX.ParserResult {
  state.inline = false
  return parse(content + '\n\n', state)
}

const parseCaptureInline: MarkdownToJSX.Parser<
  ReturnType<typeof parseInline>
> = (capture, parse, state) => {
  return {
    content: parseInline(parse, capture[1], state),
  }
}

function captureNothing() {
  return {}
}

function renderNothing() {
  return null
}

function ruleOutput(rules: MarkdownToJSX.Rules) {
  return function nestedRuleOutput(
    ast: MarkdownToJSX.ParserResult,
    outputFunc: MarkdownToJSX.RuleOutput,
    state: MarkdownToJSX.State
  ): React.ReactChild {
    return rules[ast.type].react(ast, outputFunc, state)
  }
}

function cx(...args) {
  return args.filter(Boolean).join(' ')
}

function get(src: Object, path: string, fb?: any) {
  let ptr = src
  const frags = path.split('.')

  while (frags.length) {
    ptr = ptr[frags[0]]

    if (ptr === undefined) break
    else frags.shift()
  }

  return ptr || fb
}

function getTag(tag: string, overrides: MarkdownToJSX.Overrides) {
  const override = get(overrides, tag)

  if (!override) return tag

  return typeof override === 'function' ||
    (typeof override === 'object' && 'render' in override)
    ? override
    : get(overrides, `${tag}.component`, tag)
}

enum Priority {
  /**
   * anything that must scan the tree before everything else
   */
  MAX,
  /**
   * scans for block-level constructs
   */
  HIGH,
  /**
   * inline w/ more priority than other inline
   */
  MED,
  /**
   * inline elements
   */
  LOW,
  /**
   * bare text and stuff that is considered leftovers
   */
  MIN,
}

export function compiler(
  markdown: string,
  options: MarkdownToJSX.Options = {}
) {
  options.overrides = options.overrides || {}
  options.slugify = options.slugify || slugify
  options.namedCodesToUnicode = options.namedCodesToUnicode
    ? { ...namedCodesToUnicode, ...options.namedCodesToUnicode }
    : namedCodesToUnicode

  const createElementFn = options.createElement || React.createElement

  // eslint-disable-next-line no-unused-vars
  function h(
    // locally we always will render a known string tag
    tag: MarkdownToJSX.HTMLTags,
    props: Parameters<MarkdownToJSX.CreateElement>[1] & {
      className?: string
    },
    ...children
  ) {
    const overrideProps = get(options.overrides, `${tag}.props`, {})

    return createElementFn(
      getTag(tag, options.overrides),
      {
        ...props,
        ...overrideProps,
        className: cx(props?.className, overrideProps.className) || undefined,
      },
      ...children
    )
  }

  function compile(input: string): JSX.Element {
    let inline = false

    if (options.forceInline) {
      inline = true
    } else if (!options.forceBlock) {
      /**
       * should not contain any block-level markdown like newlines, lists, headings,
       * thematic breaks, blockquotes, tables, etc
       */
      inline = SHOULD_RENDER_AS_BLOCK_R.test(input) === false
    }

    const arr = emitter(
      parser(
        inline
          ? input
          : `${input.replace(TRIM_NEWLINES_AND_TRAILING_WHITESPACE_R, '')}\n\n`,
        { inline }
      )
    )

    if (options.wrapper === null) {
      return arr
    }

    const wrapper = options.wrapper || (inline ? 'span' : 'div')
    let jsx

    if (arr.length > 1 || options.forceWrapper) {
      jsx = arr
    } else if (arr.length === 1) {
      jsx = arr[0]

      // TODO: remove this for React 16
      if (typeof jsx === 'string') {
        return <span key="outer">{jsx}</span>
      } else {
        return jsx
      }
    } else {
      // TODO: return null for React 16
      jsx = null
    }

    return React.createElement(wrapper, { key: 'outer' }, jsx)
  }

  function attrStringToMap(str: string): React.Props<any> {
    const attributes = str.match(ATTR_EXTRACTOR_R)

    return attributes
      ? attributes.reduce(function (map, raw, index) {
          const delimiterIdx = raw.indexOf('=')

          if (delimiterIdx !== -1) {
            const key = normalizeAttributeKey(raw.slice(0, delimiterIdx)).trim()
            const value = unquote(raw.slice(delimiterIdx + 1).trim())

            const mappedKey = ATTRIBUTE_TO_JSX_PROP_MAP[key] || key
            const normalizedValue = (map[
              mappedKey
            ] = attributeValueToJSXPropValue(key, value))

            if (
              typeof normalizedValue === 'string' &&
              (HTML_BLOCK_ELEMENT_R.test(normalizedValue) ||
                HTML_SELF_CLOSING_ELEMENT_R.test(normalizedValue))
            ) {
              map[mappedKey] = React.cloneElement(
                compile(normalizedValue.trim()),
                { key: index }
              )
            }
          } else if (raw !== 'style') {
            map[ATTRIBUTE_TO_JSX_PROP_MAP[raw] || raw] = true
          }

          return map
        }, {})
      : undefined
  }

  /* istanbul ignore next */
  if (process.env.NODE_ENV !== 'production') {
    if (typeof markdown !== 'string') {
      throw new Error(`markdown-to-jsx: the first argument must be
                             a string`)
    }

    if (
      Object.prototype.toString.call(options.overrides) !== '[object Object]'
    ) {
      throw new Error(`markdown-to-jsx: options.overrides (second argument property) must be
                             undefined or an object literal with shape:
                             {
                                htmltagname: {
                                    component: string|ReactComponent(optional),
                                    props: object(optional)
                                }
                             }`)
    }
  }

  const footnotes: { footnote: string; identifier: string }[] = []
  const refs: { [key: string]: { target: string; title: string } } = {}

  /**
   * each rule's react() output function goes through our custom h() JSX pragma;
   * this allows the override functionality to be automatically applied
   */
  const rules: MarkdownToJSX.Rules = {
    blockQuote: {
      match: blockRegex(BLOCKQUOTE_R),
      order: Priority.HIGH,
      parse(capture, parse, state) {
        return {
          content: parse(
            capture[0].replace(BLOCKQUOTE_TRIM_LEFT_MULTILINE_R, ''),
            state
          ),
        }
      },
      react(node, output, state) {
        return (
          <blockquote key={state.key}>{output(node.content, state)}</blockquote>
        )
      },
    } as MarkdownToJSX.Rule<{ content: MarkdownToJSX.ParserResult }>,

    breakLine: {
      match: anyScopeRegex(BREAK_LINE_R),
      order: Priority.HIGH,
      parse: captureNothing,
      react(_, __, state) {
        return <br key={state.key} />
      },
    },

    breakThematic: {
      match: blockRegex(BREAK_THEMATIC_R),
      order: Priority.HIGH,
      parse: captureNothing,
      react(_, __, state) {
        return <hr key={state.key} />
      },
    },

    codeBlock: {
      match: blockRegex(CODE_BLOCK_R),
      order: Priority.MAX,
      parse(capture /*, parse, state*/) {
        return {
          content: capture[0].replace(/^ {4}/gm, '').replace(/\n+$/, ''),
          lang: undefined,
        }
      },

      react(node, output, state) {
        return (
          <pre key={state.key}>
            <code className={node.lang ? `lang-${node.lang}` : ''}>
              {node.content}
            </code>
          </pre>
        )
      },
    } as MarkdownToJSX.Rule<{ content: string; lang?: string }>,

    codeFenced: {
      match: blockRegex(CODE_BLOCK_FENCED_R),
      order: Priority.MAX,
      parse(capture /*, parse, state*/) {
        return {
          content: capture[3],
          lang: capture[2] || undefined,
          type: 'codeBlock',
        }
      },
    },

    codeInline: {
      match: simpleInlineRegex(CODE_INLINE_R),
      order: Priority.LOW,
      parse(capture /*, parse, state*/) {
        return {
          content: capture[2],
        }
      },
      react(node, output, state) {
        return <code key={state.key}>{node.content}</code>
      },
    } as MarkdownToJSX.Rule<{ content: string }>,

    /**
     * footnotes are emitted at the end of compilation in a special <footer> block
     */
    footnote: {
      match: blockRegex(FOOTNOTE_R),
      order: Priority.MAX,
      parse(capture /*, parse, state*/) {
        footnotes.push({
          footnote: capture[2],
          identifier: capture[1],
        })

        return {}
      },
      react: renderNothing,
    },

    footnoteReference: {
      match: inlineRegex(FOOTNOTE_REFERENCE_R),
      order: Priority.HIGH,
      parse(capture /*, parse*/) {
        return {
          content: capture[1],
          target: `#${options.slugify(capture[1])}`,
        }
      },
      react(node, output, state) {
        return (
          <a key={state.key} href={sanitizeUrl(node.target)}>
            <sup key={state.key}>{node.content}</sup>
          </a>
        )
      },
    } as MarkdownToJSX.Rule<{ content: string; target: string }>,

    gfmTask: {
      match: inlineRegex(GFM_TASK_R),
      order: Priority.HIGH,
      parse(capture /*, parse, state*/) {
        return {
          completed: capture[1].toLowerCase() === 'x',
        }
      },
      react(node, output, state) {
        return (
          <input
            checked={node.completed}
            key={state.key}
            readOnly
            type="checkbox"
          />
        )
      },
    } as MarkdownToJSX.Rule<{ completed: boolean }>,

    heading: {
      match: blockRegex(HEADING_R),
      order: Priority.HIGH,
      parse(capture, parse, state) {
        return {
          content: parseInline(parse, capture[2], state),
          id: options.slugify(capture[2]),
          level: capture[1].length,
        }
      },
      react(node, output, state) {
        node.tag = `h${node.level}` as MarkdownToJSX.HTMLTags
        return (
          <node.tag id={node.id} key={state.key}>
            {output(node.content, state)}
          </node.tag>
        )
      },
    } as MarkdownToJSX.Rule<{
      content: MarkdownToJSX.ParserResult
      id: string
      level: number
      tag: MarkdownToJSX.HTMLTags
    }>,

    headingSetext: {
      match: blockRegex(HEADING_SETEXT_R),
      order: Priority.MAX,
      parse(capture, parse, state) {
        return {
          content: parseInline(parse, capture[1], state),
          level: capture[2] === '=' ? 1 : 2,
          type: 'heading',
        }
      },
    },

    htmlComment: {
      match: anyScopeRegex(HTML_COMMENT_R),
      order: Priority.HIGH,
      parse() {
        return {}
      },
      react: renderNothing,
    },

    image: {
      match: simpleInlineRegex(IMAGE_R),
      order: Priority.HIGH,
      parse(capture /*, parse, state*/) {
        return {
          alt: capture[1],
          target: unescapeUrl(capture[2]),
          title: capture[3],
        }
      },
      react(node, output, state) {
        return (
          <img
            key={state.key}
            alt={node.alt || undefined}
            title={node.title || undefined}
            src={sanitizeUrl(node.target)}
          />
        )
      },
    } as MarkdownToJSX.Rule<{ alt?: string; target: string; title?: string }>,

    link: {
      match: inlineRegex(LINK_R),
      order: Priority.LOW,
      parse(capture, parse, state) {
        return {
          content: parseSimpleInline(parse, capture[1], state),
          target: unescapeUrl(capture[2]),
          title: capture[3],
        }
      },
      react(node, output, state) {
        return (
          <a key={state.key} href={sanitizeUrl(node.target)} title={node.title}>
            {output(node.content, state)}
          </a>
        )
      },
    } as MarkdownToJSX.Rule<{
      content: MarkdownToJSX.ParserResult
      target: string
      title?: string
    }>,

    // https://daringfireball.net/projects/markdown/syntax#autolink
    linkAngleBraceStyleDetector: {
      match: inlineRegex(LINK_AUTOLINK_R),
      order: Priority.MAX,
      parse(capture /*, parse, state*/) {
        return {
          content: [
            {
              content: capture[1],
              type: 'text',
            },
          ],
          target: capture[1],
          type: 'link',
        }
      },
    },

    linkBareUrlDetector: {
      match: inlineRegex(LINK_AUTOLINK_BARE_URL_R),
      order: Priority.MAX,
      parse(capture /*, parse, state*/) {
        return {
          content: [
            {
              content: capture[1],
              type: 'text',
            },
          ],
          target: capture[1],
          title: undefined,
          type: 'link',
        }
      },
    },

    linkMailtoDetector: {
      match: inlineRegex(LINK_AUTOLINK_MAILTO_R),
      order: Priority.MAX,
      parse(capture /*, parse, state*/) {
        let address = capture[1]
        let target = capture[1]

        // Check for a `mailto:` already existing in the link:
        if (!AUTOLINK_MAILTO_CHECK_R.test(target)) {
          target = 'mailto:' + target
        }

        return {
          content: [
            {
              content: address.replace('mailto:', ''),
              type: 'text',
            },
          ],
          target: target,
          type: 'link',
        }
      },
    },

    list: {
      match(source, state, prevCapture) {
        // We only want to break into a list if we are at the start of a
        // line. This is to avoid parsing "hi * there" with "* there"
        // becoming a part of a list.
        // You might wonder, "but that's inline, so of course it wouldn't
        // start a list?". You would be correct! Except that some of our
        // lists can be inline, because they might be inside another list,
        // in which case we can parse with inline scope, but need to allow
        // nested lists inside this inline scope.
        const isStartOfLine = LIST_LOOKBEHIND_R.exec(prevCapture)
        const isListBlock = state._list || !state.inline

        if (isStartOfLine && isListBlock) {
          source = isStartOfLine[1] + source

          return LIST_R.exec(source)
        } else {
          return null
        }
      },
      order: Priority.HIGH,
      parse(capture, parse, state) {
        const bullet = capture[2]
        const ordered = bullet.length > 1
        const start = ordered ? +bullet : undefined
        const items = capture[0]
          // recognize the end of a paragraph block inside a list item:
          // two or more newlines at end end of the item
          .replace(BLOCK_END_R, '\n')
          .match(LIST_ITEM_R)

        let lastItemWasAParagraph = false
        const itemContent = items.map(function (item, i) {
          // We need to see how far indented the item is:
          const space = LIST_ITEM_PREFIX_R.exec(item)[0].length

          // And then we construct a regex to "unindent" the subsequent
          // lines of the items by that amount:
          const spaceRegex = new RegExp('^ {1,' + space + '}', 'gm')

          // Before processing the item, we need a couple things
          const content = item
            // remove indents on trailing lines:
            .replace(spaceRegex, '')
            // remove the bullet:
            .replace(LIST_ITEM_PREFIX_R, '')

          // Handling "loose" lists, like:
          //
          //  * this is wrapped in a paragraph
          //
          //  * as is this
          //
          //  * as is this
          const isLastItem = i === items.length - 1
          const containsBlocks = content.indexOf('\n\n') !== -1

          // Any element in a list is a block if it contains multiple
          // newlines. The last element in the list can also be a block
          // if the previous item in the list was a block (this is
          // because non-last items in the list can end with \n\n, but
          // the last item can't, so we just "inherit" this property
          // from our previous element).
          const thisItemIsAParagraph =
            containsBlocks || (isLastItem && lastItemWasAParagraph)
          lastItemWasAParagraph = thisItemIsAParagraph

          // backup our state for restoration afterwards. We're going to
          // want to set state._list to true, and state.inline depending
          // on our list's looseness.
          const oldStateInline = state.inline
          const oldStateList = state._list
          state._list = true

          // Parse inline if we're in a tight list, or block if we're in
          // a loose list.
          let adjustedContent
          if (thisItemIsAParagraph) {
            state.inline = false
            adjustedContent = content.replace(LIST_ITEM_END_R, '\n\n')
          } else {
            state.inline = true
            adjustedContent = content.replace(LIST_ITEM_END_R, '')
          }

          const result = parse(adjustedContent, state)

          // Restore our state before returning
          state.inline = oldStateInline
          state._list = oldStateList

          return result
        })

        return {
          items: itemContent,
          ordered: ordered,
          start: start,
        }
      },
      react(node, output, state) {
        const Tag = node.ordered ? 'ol' : 'ul'

        return (
          <Tag key={state.key} start={node.start}>
            {node.items.map(function generateListItem(item, i) {
              return <li key={i}>{output(item, state)}</li>
            })}
          </Tag>
        )
      },
    } as MarkdownToJSX.Rule<{
      items: MarkdownToJSX.ParserResult[]
      ordered: boolean
      start?: number
    }>,

    newlineCoalescer: {
      match: blockRegex(CONSECUTIVE_NEWLINE_R),
      order: Priority.LOW,
      parse: captureNothing,
      react(/*node, output, state*/) {
        return '\n'
      },
    },

    paragraph: {
      match: blockRegex(PARAGRAPH_R),
      order: Priority.LOW,
      parse: parseCaptureInline,
      react(node, output, state) {
        return <p key={state.key}>{output(node.content, state)}</p>
      },
    } as MarkdownToJSX.Rule<ReturnType<typeof parseCaptureInline>>,

    ref: {
      match: inlineRegex(REFERENCE_IMAGE_OR_LINK),
      order: Priority.MAX,
      parse(capture /*, parse*/) {
        refs[capture[1]] = {
          target: capture[2],
          title: capture[4],
        }

        return {}
      },
      react: renderNothing,
    },

    refImage: {
      match: simpleInlineRegex(REFERENCE_IMAGE_R),
      order: Priority.MAX,
      parse(capture) {
        return {
          alt: capture[1] || undefined,
          ref: capture[2],
        }
      },
      react(node, output, state) {
        return (
          <img
            key={state.key}
            alt={node.alt}
            src={sanitizeUrl(refs[node.ref].target)}
            title={refs[node.ref].title}
          />
        )
      },
    } as MarkdownToJSX.Rule<{ alt?: string; ref: string }>,

    refLink: {
      match: inlineRegex(REFERENCE_LINK_R),
      order: Priority.MAX,
      parse(capture, parse, state) {
        return {
          content: parse(capture[1], state),
          fallbackContent: parse(
            capture[0].replace(SQUARE_BRACKETS_R, '\\$1'),
            state
          ),
          ref: capture[2],
        }
      },
      react(node, output, state) {
        return refs[node.ref] ? (
          <a
            key={state.key}
            href={sanitizeUrl(refs[node.ref].target)}
            title={refs[node.ref].title}
          >
            {output(node.content, state)}
          </a>
        ) : (
          <span key={state.key}>{output(node.fallbackContent, state)}</span>
        )
      },
    } as MarkdownToJSX.Rule<{
      content: MarkdownToJSX.ParserResult
      fallbackContent: MarkdownToJSX.ParserResult
      ref: string
    }>,

    table: {
      match: blockRegex(NP_TABLE_R),
      order: Priority.HIGH,
      parse: parseTable,
      react(node, output, state) {
        return (
          <table key={state.key}>
            <thead>
              <tr>
                {node.header.map(function generateHeaderCell(content, i) {
                  return (
                    <th key={i} style={getTableStyle(node, i)}>
                      {output(content, state)}
                    </th>
                  )
                })}
              </tr>
            </thead>

            <tbody>
              {node.cells.map(function generateTableRow(row, i) {
                return (
                  <tr key={i}>
                    {row.map(function generateTableCell(content, c) {
                      return (
                        <td key={c} style={getTableStyle(node, c)}>
                          {output(content, state)}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )
      },
    } as MarkdownToJSX.Rule<ReturnType<typeof parseTable>>,

    tableSeparator: {
      match: function (source, state) {
        if (!state.inTable) {
          return null
        }
        return TABLE_SEPARATOR_R.exec(source)
      },
      order: Priority.HIGH,
      parse: function () {
        return { type: 'tableSeparator' }
      },
      // These shouldn't be reached, but in case they are, be reasonable:
      react() {
        return ' | '
      },
    },

    text: {
      // Here we look for anything followed by non-symbols,
      // double newlines, or double-space-newlines
      // We break on any symbol characters so that this grammar
      // is easy to extend without needing to modify this regex
      match: anyScopeRegex(TEXT_PLAIN_R),
      order: Priority.MIN,
      parse(capture /*, parse, state*/) {
        return {
          content: capture[0]
            // nbsp -> unicode equivalent for named chars
            .replace(HTML_CHAR_CODE_R, (full, inner) => {
              return options.namedCodesToUnicode[inner]
                ? options.namedCodesToUnicode[inner]
                : full
            }),
        }
      },
      react(node /*, output, state*/) {
        return node.content
      },
    } as MarkdownToJSX.Rule<{ content: string }>,

    textBolded: {
      match: simpleInlineRegex(TEXT_BOLD_R),
      order: Priority.MED,
      parse(capture, parse, state) {
        return {
          // capture[1] -> the syntax control character
          // capture[2] -> inner content
          content: parse(capture[2], state),
        }
      },
      react(node, output, state) {
        return <strong key={state.key}>{output(node.content, state)}</strong>
      },
    } as MarkdownToJSX.Rule<ReturnType<MarkdownToJSX.NestedParser>>,

    textEmphasized: {
      match: simpleInlineRegex(TEXT_EMPHASIZED_R),
      order: Priority.LOW,
      parse(capture, parse, state) {
        return {
          // capture[1] -> opening * or _
          // capture[2] -> inner content
          content: parse(capture[2], state),
        }
      },
      react(node, output, state) {
        return <em key={state.key}>{output(node.content, state)}</em>
      },
    } as MarkdownToJSX.Rule<ReturnType<MarkdownToJSX.NestedParser>>,

    textEscaped: {
      // We don't allow escaping numbers, letters, or spaces here so that
      // backslashes used in plain text still get rendered. But allowing
      // escaping anything else provides a very flexible escape mechanism,
      // regardless of how this grammar is extended.
      match: simpleInlineRegex(TEXT_ESCAPED_R),
      order: Priority.HIGH,
      parse(capture /*, parse, state*/) {
        return {
          content: capture[1],
          type: 'text',
        }
      },
    },

    textStrikethroughed: {
      match: simpleInlineRegex(TEXT_STRIKETHROUGHED_R),
      order: Priority.LOW,
      parse: parseCaptureInline,
      react(node, output, state) {
        return <del key={state.key}>{output(node.content, state)}</del>
      },
    } as MarkdownToJSX.Rule<ReturnType<typeof parseCaptureInline>>,
  }

  // Object.keys(rules).forEach(key => {
  //     let { match, parse } = rules[key];

  //     rules[key].match = (...args) => {
  //         const start = performance.now();
  //         const result = match(...args);
  //         const delta = performance.now() - start;

  //         if (delta > 5)
  //             console.warn(
  //                 `Slow match for ${key}: ${delta.toFixed(3)}ms, input: ${
  //                     args[0]
  //                 }`
  //             );

  //         return result;
  //     };

  //     rules[key].parse = (...args) => {
  //         const start = performance.now();
  //         const result = parse(...args);
  //         const delta = performance.now() - start;

  //         if (delta > 5)
  //             console.warn(`Slow parse for ${key}: ${delta.toFixed(3)}ms`);

  //         console.log(`${key}:parse`, `${delta.toFixed(3)}ms`, args[0]);

  //         return result;
  //     };
  // });

  if (options.disableParsingRawHTML !== true) {
    rules.htmlBlock = {
      /**
       * find the first matching end tag and process the interior
       */
      match: anyScopeRegex(HTML_BLOCK_ELEMENT_R),
      order: Priority.HIGH,
      parse(capture, parse, state) {
        const [, whitespace] = capture[3].match(HTML_LEFT_TRIM_AMOUNT_R)
        const trimmer = new RegExp(`^${whitespace}`, 'gm')
        const trimmed = capture[3].replace(trimmer, '')

        const parseFunc = containsBlockSyntax(trimmed)
          ? parseBlock
          : parseInline

        const tagName = capture[1].toLowerCase() as MarkdownToJSX.HTMLTags
        const noInnerParse =
          DO_NOT_PROCESS_HTML_ELEMENTS.indexOf(tagName) !== -1

        return {
          attrs: attrStringToMap(capture[2]),
          /**
           * if another html block is detected within, parse as block,
           * otherwise parse as inline to pick up any further markdown
           */
          content: noInnerParse ? capture[3] : parseFunc(parse, trimmed, state),

          noInnerParse,

          tag: noInnerParse ? tagName : capture[1],
        }
      },
      react(node, output, state) {
        return (
          // @ts-ignore
          <node.tag key={state.key} {...node.attrs}>
            {node.noInnerParse
              ? (node.content as string)
              : output(node.content as MarkdownToJSX.ParserResult, state)}
          </node.tag>
        )
      },
    } as MarkdownToJSX.Rule<{
      attrs: ReturnType<typeof attrStringToMap>
      content: string | ReturnType<MarkdownToJSX.NestedParser>
      noInnerParse: Boolean
      tag: string
    }>

    rules.htmlSelfClosing = {
      /**
       * find the first matching end tag and process the interior
       */
      match: anyScopeRegex(HTML_SELF_CLOSING_ELEMENT_R),
      order: Priority.HIGH,
      parse(capture /*, parse, state*/) {
        return {
          attrs: attrStringToMap(capture[2] || ''),
          tag: capture[1],
        }
      },
      react(node, output, state) {
        return <node.tag {...node.attrs} key={state.key} />
      },
    } as MarkdownToJSX.Rule<{
      attrs: ReturnType<typeof attrStringToMap>
      tag: string
    }>
  }

  const parser = parserFor(rules)
  const emitter: Function = reactFor(ruleOutput(rules))

  const jsx = compile(markdown)

  if (footnotes.length) {
    jsx.props.children.push(
      <footer key="footer">
        {footnotes.map(function createFootnote(def) {
          return (
            <div id={options.slugify(def.identifier)} key={def.identifier}>
              {def.identifier}
              {emitter(parser(def.footnote, { inline: true }))}
            </div>
          )
        })}
      </footer>
    )
  }

  return jsx
}

/**
 * A simple HOC for easy React use. Feed the markdown content as a direct child
 * and the rest is taken care of automatically.
 */
const Markdown: React.FC<{
  [key: string]: any
  children: string
  options?: MarkdownToJSX.Options
}> = ({ children, options, ...props }) => {
  return React.cloneElement(
    compiler(children, options),
    props as React.Props<any>
  )
}

export default Markdown
