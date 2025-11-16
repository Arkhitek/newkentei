module.exports = {
  // HTML内巨大インライン<script>にもクラスが現れるためHTML再帰的スキャン
  content: [
    './public/**/*.html'
  ],
  theme: {
    extend: {}
  },
  plugins: [],
  // safelistが必要になったら以下例:
  // safelist: ['btn', 'btn-primary', 'btn-secondary', 'option-btn']
};
