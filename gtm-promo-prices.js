/**
 * GTM Script - Exibe desconto por numeração na página de produto
 * Constance Calçados (VTEX Store Framework)
 *
 * Injetar via GTM com trigger configurado no GTM
 */
(function () {
  'use strict';

  var CONFIG = {
    skuSelectorContainer: '.constance-vtex-modified-0-x-skuSelectorContainer',
    skuItem: '.constance-vtex-modified-0-x-skuSelectorItem',
    promoContainerStyles: {
      backgroundColor: '#fff3f3',
      border: '1px solid #e91e63',
      borderRadius: '8px',
      padding: '12px 16px',
      marginTop: '10px',
      marginBottom: '10px',
      fontSize: '14px',
      color: '#333',
      lineHeight: '1.6',
    },
    dotStyles: {
      position: 'absolute',
      top: '-4px',
      right: '-4px',
      width: '10px',
      height: '10px',
      backgroundColor: '#e91e63',
      borderRadius: '50%',
      zIndex: '10',
      pointerEvents: 'none',
    },
    maxRetries: 30,
    retryInterval: 500,
  };

  function fetchProductData() {
    var skuId = getSkuId();
    var productSlug = getProductSlug();

    if (skuId) {
      return fetch(
        '/api/catalog_system/pub/products/search?fq=skuId:' + skuId
      ).then(function (r) { return r.json(); });
    }

    if (productSlug) {
      return fetch(
        '/api/catalog_system/pub/products/search/' + productSlug + '/p'
      ).then(function (r) { return r.json(); });
    }

    return Promise.reject('Produto não encontrado');
  }

  function getSkuId() {
    var params = new URLSearchParams(window.location.search);
    var skuId = params.get('skuId');
    if (skuId) return skuId;
    try {
      if (window.__RUNTIME__ && window.__RUNTIME__.query) {
        return window.__RUNTIME__.query.skuId || null;
      }
    } catch (e) {}
    return null;
  }

  function getProductSlug() {
    var match = window.location.pathname.match(/\/([^/]+)\/p/);
    return match ? match[1] : null;
  }

  function formatCurrency(value) {
    return (
      'R$ ' +
      value
        .toFixed(2)
        .replace('.', ',')
        .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    );
  }

  function calcDiscount(listPrice, sellingPrice) {
    if (!listPrice || listPrice <= sellingPrice) return 0;
    return Math.round(((listPrice - sellingPrice) / listPrice) * 100);
  }

  // Extrai mapa de descontos por numeração: { "33": { listPrice, price, discount }, ... }
  function getDiscountsBySize(product) {
    var items = product.items || [];
    var discounts = {};

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var offer = (item.sellers && item.sellers[0] && item.sellers[0].commertialOffer) || {};

      if (!offer.AvailableQuantity || offer.AvailableQuantity <= 0) continue;

      var listPrice = offer.ListPrice || 0;
      var price = offer.Price || 0;
      var discount = calcDiscount(listPrice, price);

      // Pega o nome da variação (numeração)
      var sizeName = item.name || '';
      // Tenta extrair só o número do nome da variação
      var sizeMatch = sizeName.match(/\d+/);
      var sizeKey = sizeMatch ? sizeMatch[0] : sizeName;

      // Melhor parcelamento sem juros
      var installments = null;
      var installmentsList = offer.Installments || [];
      for (var k = 0; k < installmentsList.length; k++) {
        var inst = installmentsList[k];
        if (inst.InterestRate === 0 && inst.NumberOfInstallments > 1) {
          if (!installments || inst.NumberOfInstallments > installments.count) {
            installments = {
              count: inst.NumberOfInstallments,
              value: inst.Value,
            };
          }
        }
      }

      discounts[sizeKey] = {
        listPrice: listPrice,
        price: price,
        discount: discount,
        installments: installments,
      };
    }

    return discounts;
  }

  // Adiciona bolinha rosa em cima das numerações com desconto
  function addDotsToSizes(discountsBySize) {
    var skuItems = document.querySelectorAll(CONFIG.skuItem);

    for (var i = 0; i < skuItems.length; i++) {
      var el = skuItems[i];
      var className = el.className || '';

      // Remove dots antigos
      var oldDots = el.querySelectorAll('.cst-promo-dot');
      for (var d = 0; d < oldDots.length; d++) oldDots[d].remove();

      // Extrai o número da numeração da classe (ex: skuSelectorItem--34)
      var match = className.match(/skuSelectorItem--(\d+)/);
      if (!match) continue;

      var size = match[1];
      var data = discountsBySize[size];

      if (data && data.discount > 0) {
        // Garante position relative no item
        el.style.position = 'relative';

        var dot = document.createElement('span');
        dot.className = 'cst-promo-dot';
        dot.title = '-' + data.discount + '% nesta numeração';
        Object.assign(dot.style, CONFIG.dotStyles);
        el.appendChild(dot);
      }
    }
  }

  function createPromoContainer(discountsBySize) {
    var container = document.createElement('div');
    container.className = 'cst-promo-container';
    container.id = 'cst-promo-info';
    Object.assign(container.style, CONFIG.promoContainerStyles);

    // Conta quantas numerações têm desconto
    var sizesWithDiscount = [];
    var keys = Object.keys(discountsBySize);
    for (var i = 0; i < keys.length; i++) {
      if (discountsBySize[keys[i]].discount > 0) {
        sizesWithDiscount.push(keys[i]);
      }
    }

    if (sizesWithDiscount.length === 0) return null;

    var allHaveDiscount = sizesWithDiscount.length === keys.length;

    var html = '<div style="font-size:15px; font-weight:700; color:#e91e63; margin-bottom:6px;">';

    if (allHaveDiscount) {
      html += 'Desconto em todas as numerações!';
    } else {
      html += 'Desconto em algumas numerações!';
    }

    html += '</div>';
    html +=
      '<div style="font-size:13px; color:#555;">' +
      'Numerações com desconto estão sinalizadas com ' +
      '<span style="display:inline-block; width:10px; height:10px; background:#e91e63; border-radius:50%; vertical-align:middle;"></span>' +
      '. Selecione para ver o preço.' +
      '</div>';

    // Lista resumida dos descontos
    html += '<div style="margin-top:8px; font-size:12px; color:#666;">';
    for (var j = 0; j < sizesWithDiscount.length; j++) {
      var size = sizesWithDiscount[j];
      var d = discountsBySize[size];
      html +=
        '<span style="display:inline-block; background:#fce4ec; padding:2px 8px; border-radius:12px; margin:2px 4px 2px 0; font-weight:600;">' +
        'N° ' + size + ': ' + formatCurrency(d.price) +
        ' <span style="color:#e91e63;">(-' + d.discount + '%)</span>' +
        '</span>';
    }
    html += '</div>';

    container.innerHTML = html;
    return container;
  }

  function injectPromo(discountsBySize) {
    // Remove injeção anterior
    var existing = document.getElementById('cst-promo-info');
    if (existing) existing.remove();

    // Adiciona bolinhas nas numerações
    addDotsToSizes(discountsBySize);

    // Cria container de aviso
    var promoContainer = createPromoContainer(discountsBySize);
    if (!promoContainer) return;

    var skuSelector = document.querySelector(CONFIG.skuSelectorContainer);
    if (!skuSelector) return false;

    skuSelector.parentNode.insertBefore(
      promoContainer,
      skuSelector.nextSibling
    );

    // Dispara evento para o dataLayer do GTM
    var sizesWithDiscount = Object.keys(discountsBySize).filter(function (k) {
      return discountsBySize[k].discount > 0;
    });

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: 'promoPrice_displayed',
      promoData: {
        sizesWithDiscount: sizesWithDiscount.length,
        totalSizes: Object.keys(discountsBySize).length,
      },
    });
  }

  function init(retries) {
    retries = retries || 0;

    var skuSelector = document.querySelector(CONFIG.skuSelectorContainer);

    if (!skuSelector && retries < CONFIG.maxRetries) {
      setTimeout(function () {
        init(retries + 1);
      }, CONFIG.retryInterval);
      return;
    }

    if (!skuSelector) return;

    fetchProductData()
      .then(function (products) {
        if (!products || !products.length) return;

        var product = products[0];
        var discountsBySize = getDiscountsBySize(product);

        injectPromo(discountsBySize);
      })
      .catch(function (err) {
        console.warn('[CST Promo] Erro ao buscar dados:', err);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(); });
  } else {
    init();
  }

  // Observa navegação SPA
  var lastUrl = window.location.href;
  var observer = new MutationObserver(function () {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      setTimeout(function () { init(); }, 1000);
    }
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
