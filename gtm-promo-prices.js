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
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      backgroundColor: '#fce4ec',
      border: '1px solid #e91e63',
      borderRadius: '8px',
      padding: '10px 14px',
      marginTop: '12px',
      marginBottom: '4px',
      fontSize: '14px',
      color: '#c2185b',
      fontWeight: '600',
      lineHeight: '1.3',
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

      var priceWithoutDiscount = offer.PriceWithoutDiscount || offer.ListPrice || 0;
      var price = offer.Price || 0;
      var discount = calcDiscount(priceWithoutDiscount, price);

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
        priceWithoutDiscount: priceWithoutDiscount,
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
    // Verifica se há pelo menos uma numeração com desconto
    var keys = Object.keys(discountsBySize);
    var hasAny = false;
    for (var i = 0; i < keys.length; i++) {
      if (discountsBySize[keys[i]].discount > 0) { hasAny = true; break; }
    }
    if (!hasAny) return null;

    // Injeta CSS de mobile uma única vez
    if (!document.getElementById('cst-promo-style')) {
      var style = document.createElement('style');
      style.id = 'cst-promo-style';
      style.textContent = '@media (max-width: 768px) { #cst-promo-info { margin-left: 16px; margin-right: 16px; } }';
      document.head.appendChild(style);
    }

    var container = document.createElement('div');
    container.className = 'cst-promo-container';
    container.id = 'cst-promo-info';
    Object.assign(container.style, CONFIG.promoContainerStyles);

    container.innerHTML =
      '<span style="display:inline-block; width:10px; height:10px; background:#e91e63; border-radius:50%; flex-shrink:0;"></span>' +
      '<span>Numerações com desconto estão sinalizadas. Selecione para ver o preço.</span>';

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
