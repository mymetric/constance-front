/**
 * GTM Script - Exibe números promocionais na página de produto
 * Constance Calçados (VTEX Store Framework)
 *
 * Injetar via GTM com trigger: Page View em páginas de produto
 * (URL contém "/p")
 */
(function () {
  'use strict';

  var CONFIG = {
    // Seletores VTEX Store Framework (ajustar se necessário)
    sellingPriceSelector:
      '[class*="sellingPrice"], [class*="product-price"] [class*="currencyContainer"], .vtex-product-price-1-x-sellingPrice',
    listPriceSelector:
      '[class*="listPrice"], .vtex-product-price-1-x-listPrice',
    containerSelector:
      '[class*="productPriceContainer"], [class*="product-price"], .vtex-product-price-1-x-productPriceContainer, .vtex-flex-layout-0-x-flexRow',
    // Estilo do badge de desconto
    badgeStyles: {
      backgroundColor: '#e91e63',
      color: '#ffffff',
      padding: '4px 10px',
      borderRadius: '4px',
      fontSize: '14px',
      fontWeight: '700',
      display: 'inline-block',
      marginLeft: '8px',
      lineHeight: '1.4',
    },
    // Estilo do container de promoção
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
    maxRetries: 30,
    retryInterval: 500,
  };

  // Busca dados do produto pela API VTEX
  function fetchProductData() {
    var skuId = getSkuId();
    var productSlug = getProductSlug();

    if (skuId) {
      return fetch(
        '/api/catalog_system/pub/products/search?fq=skuId:' + skuId
      ).then(function (r) {
        return r.json();
      });
    }

    if (productSlug) {
      return fetch(
        '/api/catalog_system/pub/products/search/' + productSlug + '/p'
      ).then(function (r) {
        return r.json();
      });
    }

    return Promise.reject('Produto não encontrado');
  }

  function getSkuId() {
    var params = new URLSearchParams(window.location.search);
    var skuId = params.get('skuId');
    if (skuId) return skuId;

    // Tenta pegar do runtime VTEX
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

  function createBadge(text) {
    var badge = document.createElement('span');
    badge.className = 'cst-promo-badge';
    badge.textContent = text;
    Object.assign(badge.style, CONFIG.badgeStyles);
    return badge;
  }

  function createPromoContainer(data) {
    var container = document.createElement('div');
    container.className = 'cst-promo-container';
    container.id = 'cst-promo-info';
    Object.assign(container.style, CONFIG.promoContainerStyles);

    var discount = calcDiscount(data.listPrice, data.sellingPrice);
    var savings = data.listPrice - data.sellingPrice;

    var html = '';

    // Linha do preço original (De:)
    if (discount > 0) {
      html +=
        '<div style="color:#999; font-size:13px;">' +
        'De: <span style="text-decoration:line-through;">' +
        formatCurrency(data.listPrice) +
        '</span>' +
        '</div>';
    }

    // Linha do preço promocional (Por:)
    html +=
      '<div style="font-size:22px; font-weight:700; color:#e91e63; margin:4px 0;">' +
      'Por: ' +
      formatCurrency(data.sellingPrice);

    if (discount > 0) {
      html +=
        ' <span style="' +
        'background:#e91e63; color:#fff; padding:2px 8px; border-radius:4px; font-size:13px; font-weight:700; vertical-align:middle;' +
        '">' +
        '-' +
        discount +
        '%</span>';
    }
    html += '</div>';

    // Economia
    if (discount > 0) {
      html +=
        '<div style="color:#2e7d32; font-size:13px; font-weight:600; margin-top:2px;">' +
        'Economia de ' +
        formatCurrency(savings) +
        '</div>';
    }

    // Parcelamento
    if (data.installments && data.installments.count > 1) {
      html +=
        '<div style="font-size:13px; color:#555; margin-top:6px;">' +
        'ou ' +
        data.installments.count +
        'x de ' +
        formatCurrency(data.installments.value) +
        ' sem juros' +
        '</div>';
    }

    // Preço no Pix (5% extra de desconto como exemplo — ajustar conforme regra real)
    if (data.sellingPrice > 0) {
      var pixPrice = data.sellingPrice * 0.95;
      html +=
        '<div style="font-size:13px; color:#00796b; margin-top:6px; font-weight:600;">' +
        'No Pix: ' +
        formatCurrency(pixPrice) +
        ' (5% off)' +
        '</div>';
    }

    container.innerHTML = html;
    return container;
  }

  function getSelectedSkuOffer(product) {
    var skuId = getSkuId();
    var items = product.items || [];

    // Busca o SKU selecionado
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (skuId && item.itemId === skuId) {
        var offer = (item.sellers && item.sellers[0] && item.sellers[0].commertialOffer) || {};
        return extractOfferData(offer);
      }
    }

    // Fallback: primeiro SKU disponível
    for (var j = 0; j < items.length; j++) {
      var fallbackItem = items[j];
      var fallbackOffer = (fallbackItem.sellers && fallbackItem.sellers[0] && fallbackItem.sellers[0].commertialOffer) || {};
      if (fallbackOffer.AvailableQuantity > 0) {
        return extractOfferData(fallbackOffer);
      }
    }

    return null;
  }

  function extractOfferData(offer) {
    var listPrice = offer.ListPrice || 0;
    var sellingPrice = offer.Price || 0;

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
            total: inst.TotalValuePlusInterestRate,
          };
        }
      }
    }

    return {
      listPrice: listPrice,
      sellingPrice: sellingPrice,
      installments: installments,
    };
  }

  function injectPromoInfo(data) {
    // Remove injeção anterior (evita duplicação)
    var existing = document.getElementById('cst-promo-info');
    if (existing) existing.remove();

    var discount = calcDiscount(data.listPrice, data.sellingPrice);

    // Só exibe se tiver desconto
    if (discount <= 0) return;

    var promoContainer = createPromoContainer(data);

    // Insere logo após o seletor de numeração (classes exatas da Constance)
    var skuSelector = document.querySelector(
      '.constance-vtex-modified-0-x-skuSelectorContainer'
    );

    if (skuSelector) {
      skuSelector.parentNode.insertBefore(
        promoContainer,
        skuSelector.nextSibling
      );
    } else {
      // Fallback: após o nome do produto
      var productName = document.querySelector(
        '.vtex-store-components-3-x-productNameContainer'
      );
      if (productName) {
        productName.parentNode.insertBefore(
          promoContainer,
          productName.nextSibling
        );
      }
    }

    // Dispara evento para o dataLayer do GTM
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: 'promoPrice_displayed',
      promoData: {
        listPrice: data.listPrice,
        sellingPrice: data.sellingPrice,
        discount: discount,
        savings: data.listPrice - data.sellingPrice,
      },
    });
  }

  function init(retries) {
    retries = retries || 0;

    // Verifica se a página de produto já renderizou
    var hasProduct =
      document.querySelector('h1, [class*="productName"]') ||
      (window.__RUNTIME__ && window.__RUNTIME__.route && window.__RUNTIME__.route.id === 'store.product');

    if (!hasProduct && retries < CONFIG.maxRetries) {
      setTimeout(function () {
        init(retries + 1);
      }, CONFIG.retryInterval);
      return;
    }

    fetchProductData()
      .then(function (products) {
        if (!products || !products.length) return;

        var product = products[0];
        var offerData = getSelectedSkuOffer(product);

        if (offerData) {
          injectPromoInfo(offerData);
        }
      })
      .catch(function (err) {
        console.warn('[CST Promo] Erro ao buscar dados:', err);
      });
  }

  // Aguarda o DOM estar pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      init();
    });
  } else {
    init();
  }

  // Observa mudanças de SKU (troca de tamanho/cor) via navegação SPA
  var lastUrl = window.location.href;
  var observer = new MutationObserver(function () {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      setTimeout(function () {
        init();
      }, 1000);
    }
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
