(function () {
  const FIELD_SELECTORS = {
    alt: [
      '.media-modal .attachment-details .setting[data-setting="alt"] textarea',
      '.media-modal .attachment-details .setting[data-setting="alt"] input',
      '.media-modal [data-setting="alt"] textarea',
      '.media-modal [data-setting="alt"] input',
      '.attachment-details .setting[data-setting="alt"] textarea',
      '.attachment-details .setting[data-setting="alt"] input',
      '.attachment-details [data-setting="alt"] textarea',
      '.attachment-details [data-setting="alt"] input',
      '#attachment_alt',
      'textarea.attachment-alt-text',
      'input.attachment-alt-text',
      'textarea[aria-label="Texto alternativo"]',
      'input[aria-label="Texto alternativo"]',
      'textarea[aria-label="Alt text"]',
      'input[aria-label="Alt text"]',
      'input[name="attachment[alt]"]',
      'textarea[name="attachment[alt]"]'
    ],
    caption: [
      '.media-modal .attachment-details .setting[data-setting="caption"] [contenteditable="true"]',
      '.media-modal .attachment-details .setting[data-setting="caption"] textarea',
      '.media-modal .attachment-details .setting[data-setting="caption"] input',
      '.media-modal [data-setting="caption"] [contenteditable="true"]',
      '.media-modal [data-setting="caption"] textarea',
      '.media-modal [data-setting="caption"] input',
      '.attachment-details .setting[data-setting="caption"] [contenteditable="true"]',
      '.attachment-details .setting[data-setting="caption"] textarea',
      '.attachment-details .setting[data-setting="caption"] input',
      '.attachment-details [data-setting="caption"] [contenteditable="true"]',
      '.attachment-details [data-setting="caption"] textarea',
      '.attachment-details [data-setting="caption"] input',
      '.media-frame .attachment-details [contenteditable="true"]',
      '.media-frame [contenteditable="true"]',
      '.compat-field-exif_caption textarea',
      '.compat-field-exif_caption [contenteditable="true"]',
      '#attachment_caption',
      'textarea.attachment-caption',
      'input.attachment-caption',
      '[contenteditable="true"][data-setting="caption"]',
      '[contenteditable="true"].caption',
      'textarea[aria-label="Leyenda"]',
      'input[aria-label="Leyenda"]',
      '[contenteditable="true"][aria-label="Leyenda"]',
      'textarea[aria-label="Caption"]',
      'input[aria-label="Caption"]',
      '[contenteditable="true"][aria-label="Caption"]',
      'textarea[name="attachment[caption]"]',
      'input[name="attachment[caption]"]'
    ],
    title: [
      '.media-modal .attachment-details .setting[data-setting="title"] textarea',
      '.media-modal .attachment-details .setting[data-setting="title"] input',
      '.media-modal [data-setting="title"] textarea',
      '.media-modal [data-setting="title"] input',
      '.attachment-details .setting[data-setting="title"] textarea',
      '.attachment-details .setting[data-setting="title"] input',
      '.attachment-details [data-setting="title"] textarea',
      '.attachment-details [data-setting="title"] input',
      '#attachment_title',
      'textarea.attachment-title',
      'input.attachment-title',
      'textarea[aria-label="Título"]',
      'input[aria-label="Título"]',
      'textarea[aria-label="Title"]',
      'input[aria-label="Title"]',
      'input[name="attachment[title]"]',
      'textarea[name="attachment[title]"]'
    ]
  };

  const LABEL_ALIASES = {
    alt: ["texto alternativo", "alt text", "alternative text", "alt"],
    caption: ["leyenda", "caption"],
    title: ["título", "titulo", "title"]
  };

  function getFieldSelector(key) {
    return (FIELD_SELECTORS[key] || []).join(",");
  }

  function getAttachmentFieldSelectors(id, key) {
    const attachmentSelectors = {
      alt: [
        '.attachment-details .setting[data-setting="alt"] textarea',
        '.attachment-details .setting[data-setting="alt"] input',
        '.attachment-details [data-setting="alt"] textarea',
        '.attachment-details [data-setting="alt"] input',
        '.media-modal .attachment-details .setting[data-setting="alt"] textarea',
        '.media-modal .attachment-details .setting[data-setting="alt"] input',
        '.media-modal [data-setting="alt"] textarea',
        '.media-modal [data-setting="alt"] input',
        '#attachment_alt',
        'textarea.attachment-alt-text',
        'input.attachment-alt-text',
        `textarea[name="attachments[${id}][alt]"]`,
        `input[name="attachments[${id}][alt]"]`,
        'textarea[aria-label="Texto alternativo"]',
        'input[aria-label="Texto alternativo"]',
        'textarea[aria-label="Alt text"]',
        'input[aria-label="Alt text"]'
      ],
      caption: [
        `.attachment-details .setting[data-setting="caption"] [contenteditable="true"]`,
        `.attachment-details .setting[data-setting="caption"] textarea`,
        `.attachment-details .setting[data-setting="caption"] input`,
        `.attachment-details [data-setting="caption"] [contenteditable="true"]`,
        `.attachment-details [data-setting="caption"] textarea`,
        `.attachment-details [data-setting="caption"] input`,
        `.media-modal .attachment-details .setting[data-setting="caption"] [contenteditable="true"]`,
        `.media-modal .attachment-details .setting[data-setting="caption"] textarea`,
        `.media-modal .attachment-details .setting[data-setting="caption"] input`,
        `.media-modal [data-setting="caption"] [contenteditable="true"]`,
        `.media-modal [data-setting="caption"] textarea`,
        `.media-modal [data-setting="caption"] input`,
        `.media-frame .attachment-details [contenteditable="true"]`,
        `.compat-field-exif_caption [contenteditable="true"]`,
        `.compat-field-exif_caption textarea`,
        '#attachment_caption',
        'textarea.attachment-caption',
        'input.attachment-caption',
        `[contenteditable="true"][name="attachments[${id}][caption]"]`,
        `textarea[name="attachments[${id}][caption]"]`,
        `input[name="attachments[${id}][caption]"]`,
        '[contenteditable="true"][aria-label="Leyenda"]',
        'textarea[aria-label="Leyenda"]',
        'input[aria-label="Leyenda"]',
        '[contenteditable="true"][aria-label="Caption"]',
        'textarea[aria-label="Caption"]',
        'input[aria-label="Caption"]'
      ],
      title: [
        '#attachment_title',
        'input.attachment-title',
        'textarea.attachment-title',
        '.attachment-details .setting[data-setting="title"] input',
        '.attachment-details .setting[data-setting="title"] textarea',
        '.attachment-details [data-setting="title"] input',
        '.attachment-details [data-setting="title"] textarea',
        '.setting[data-setting="title"] input',
        '.setting[data-setting="title"] textarea',
        `input[name="attachments[${id}][title]"]`,
        `textarea[name="attachments[${id}][title]"]`,
        'input[aria-label="Título"]',
        'textarea[aria-label="Título"]',
        'input[aria-label="Title"]',
        'textarea[aria-label="Title"]'
      ]
    };
    return attachmentSelectors[key] || [];
  }

  window.__MACA_WP_SELECTORS = {
    FIELD_SELECTORS,
    LABEL_ALIASES,
    getFieldSelector,
    getAttachmentFieldSelectors
  };
})();
