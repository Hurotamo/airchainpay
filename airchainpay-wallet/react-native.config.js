module.exports = {
  dependencies: {
    'react-native-ble-plx': {
      platforms: {
        android: {
          sourceDir: '../node_modules/react-native-ble-plx/android',
          packageImportPath: 'import com.polidea.rxandroidble2.RxBleClient;',
          packageInstance: 'RxBleClient.create(this)'
        }
      }
    },
    'tp-rn-ble-advertiser': {
      platforms: {
        android: {
          sourceDir: '../node_modules/tp-rn-ble-advertiser/android',
          packageImportPath: 'import com.tulparyazilim.ble.ReactNativeBleAdvertiserPackage;',
          packageInstance: 'new ReactNativeBleAdvertiserPackage()'
        }
      }
    }
  }
}; 