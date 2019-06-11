module.exports = function SequenceServiceFactory() {
  var seq = -1;
  var cycle = 100;

  return {
    next: function() {
      return ++seq >= cycle ? (seq = 0) : seq;
    }
  };
};
